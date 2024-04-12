import 'dart:async';

import 'package:flutter/material.dart';
import 'package:hooks_riverpod/hooks_riverpod.dart';
import 'package:immich_mobile/shared/models/asset.dart';
import 'package:immich_mobile/shared/models/exif_info.dart';
import 'package:immich_mobile/shared/models/store.dart';
import 'package:immich_mobile/shared/models/user.dart';
import 'package:immich_mobile/shared/providers/api.provider.dart';
import 'package:immich_mobile/shared/providers/db.provider.dart';
import 'package:immich_mobile/shared/services/api.service.dart';
import 'package:immich_mobile/shared/services/sync.service.dart';
import 'package:immich_mobile/shared/services/user.service.dart';
import 'package:isar/isar.dart';
import 'package:logging/logging.dart';
import 'package:maplibre_gl/maplibre_gl.dart';
import 'package:openapi/api.dart';

final assetServiceProvider = Provider(
  (ref) => AssetService(
    ref.watch(apiServiceProvider),
    ref.watch(syncServiceProvider),
    ref.watch(userServiceProvider),
    ref.watch(dbProvider),
  ),
);

class AssetService {
  final ApiService _apiService;
  final SyncService _syncService;
  final UserService _userService;
  final log = Logger('AssetService');
  final Isar _db;

  AssetService(
    this._apiService,
    this._syncService,
    this._userService,
    this._db,
  );

  /// Checks the server for updated assets and updates the local database if
  /// required. Returns `true` if there were any changes.
  Future<bool> refreshRemoteAssets() async {
    final List<User> users = await _db.users
        .filter()
        .isPartnerSharedWithEqualTo(true)
        .or()
        .isarIdEqualTo(Store.get(StoreKey.currentUser).isarId)
        .findAll();
    final Stopwatch sw = Stopwatch()..start();
    final bool changes = await _syncService.syncRemoteAssetsToDb(
      users,
      _getRemoteAssetChanges,
      _getRemoteAssets,
      _userService.getUsersFromServer,
    );
    debugPrint("refreshRemoteAssets full took ${sw.elapsedMilliseconds}ms");
    return changes;
  }

  /// Returns `(null, null)` if changes are invalid -> requires full sync
  Future<(List<Asset>? toUpsert, List<String>? toDelete)>
      _getRemoteAssetChanges(List<User> users, DateTime since) async {
    final changes = await _apiService.syncApi
        .getDeltaSync(since, users.map((e) => e.id).toList());
    return changes == null || changes.needsFullSync
        ? (null, null)
        : (changes.upserted.map(Asset.remote).toList(), changes.deleted);
  }

  /// Returns the list of people of the given asset id.
  // If the server is not reachable `null` is returned.
  Future<List<PersonWithFacesResponseDto>?> getRemotePeopleOfAsset(
    String remoteId,
  ) async {
    try {
      final AssetResponseDto? dto =
          await _apiService.assetApi.getAssetInfo(remoteId);

      return dto?.people;
    } catch (error, stack) {
      log.severe(
        'Error while getting remote asset info: ${error.toString()}',
        error,
        stack,
      );

      return null;
    }
  }

  /// Returns `null` if the server state did not change, else list of assets
  Future<List<Asset>?> _getRemoteAssets(User user, DateTime until) async {
    const int chunkSize = 10000;
    try {
      final List<Asset> allAssets = [];
      DateTime? lastCreationDate;
      String? lastId;
      for (;;) {
        final List<AssetResponseDto>? assets =
            await _apiService.syncApi.getAllForUserFullSync(
          chunkSize,
          until,
          userId: user.id,
          lastCreationDate: lastCreationDate,
          lastId: lastId,
        );
        if (assets == null) return null;
        allAssets.addAll(assets.map(Asset.remote));
        if (assets.length < chunkSize) break;
        lastCreationDate = assets.last.fileCreatedAt;
        lastId = assets.last.id;
      }
      return allAssets;
    } catch (error, stack) {
      log.severe('Error while getting remote assets', error, stack);
      return null;
    }
  }

  Future<bool> deleteAssets(
    Iterable<Asset> deleteAssets, {
    bool? force = false,
  }) async {
    try {
      final List<String> payload = [];

      for (final asset in deleteAssets) {
        payload.add(asset.remoteId!);
      }

      await _apiService.assetApi.deleteAssets(
        AssetBulkDeleteDto(
          ids: payload,
          force: force,
        ),
      );
      return true;
    } catch (error, stack) {
      log.severe("Error while deleting assets", error, stack);
    }
    return false;
  }

  /// Loads the exif information from the database. If there is none, loads
  /// the exif info from the server (remote assets only)
  Future<Asset> loadExif(Asset a) async {
    a.exifInfo ??= await _db.exifInfos.get(a.id);
    // fileSize is always filled on the server but not set on client
    if (a.exifInfo?.fileSize == null) {
      if (a.isRemote) {
        final dto = await _apiService.assetApi.getAssetInfo(a.remoteId!);
        if (dto != null && dto.exifInfo != null) {
          final newExif = Asset.remote(dto).exifInfo!.copyWith(id: a.id);
          if (newExif != a.exifInfo) {
            if (a.isInDb) {
              _db.writeTxn(() => a.put(_db));
            } else {
              debugPrint("[loadExif] parameter Asset is not from DB!");
            }
          }
        }
      } else {
        // TODO implement local exif info parsing
      }
    }
    return a;
  }

  Future<List<Asset?>> updateAssets(
    List<Asset> assets,
    UpdateAssetDto updateAssetDto,
  ) async {
    final List<AssetResponseDto?> dtos = await Future.wait(
      assets.map(
        (a) => _apiService.assetApi.updateAsset(a.remoteId!, updateAssetDto),
      ),
    );
    bool allInDb = true;
    for (int i = 0; i < assets.length; i++) {
      final dto = dtos[i], old = assets[i];
      if (dto != null) {
        final remote = Asset.remote(dto);
        if (old.canUpdate(remote)) {
          assets[i] = old.updatedCopy(remote);
        }
        allInDb &= assets[i].isInDb;
      }
    }
    final toUpdate = allInDb ? assets : assets.where((e) => e.isInDb).toList();
    await _syncService.upsertAssetsWithExif(toUpdate);
    return assets;
  }

  Future<List<Asset?>> changeFavoriteStatus(
    List<Asset> assets,
    bool isFavorite,
  ) {
    return updateAssets(assets, UpdateAssetDto(isFavorite: isFavorite));
  }

  Future<List<Asset?>> changeArchiveStatus(List<Asset> assets, bool isArchive) {
    return updateAssets(assets, UpdateAssetDto(isArchived: isArchive));
  }

  Future<List<Asset?>> changeDateTime(
    List<Asset> assets,
    String updatedDt,
  ) {
    return updateAssets(
      assets,
      UpdateAssetDto(dateTimeOriginal: updatedDt),
    );
  }

  Future<List<Asset?>> changeLocation(
    List<Asset> assets,
    LatLng location,
  ) {
    return updateAssets(
      assets,
      UpdateAssetDto(
        latitude: location.latitude,
        longitude: location.longitude,
      ),
    );
  }
}
