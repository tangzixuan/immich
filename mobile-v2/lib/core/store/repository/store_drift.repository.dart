import 'dart:async';

import 'package:drift/drift.dart';
import 'package:immich_mobile/core/database/repository/drift_database.repository.dart';
import 'package:immich_mobile/core/store/model/store_key.model.dart';
import 'package:immich_mobile/core/store/model/store_value.model.dart';
import 'package:immich_mobile/core/store/repository/store.repository.dart';

class StoreDriftRepository implements StoreRepository {
  final DriftDatabaseRepository db;

  const StoreDriftRepository(this.db);

  @override
  FutureOr<T?> getValue<T>(StoreKey key) async {
    final StoreValue? value = await (db.select(db.store)
          ..where((tbl) => tbl.id.equals(key.id)))
        .getSingleOrNull();
    return value?.extract(key.type);
  }

  @override
  FutureOr<void> setValue<T>(StoreKey<T> key, T value) {
    return db.transaction(() async {
      final storeValue = StoreValue.of(key, value);
      await db.into(db.store).insertOnConflictUpdate(StoreCompanion.insert(
            id: Value(storeValue.id),
            intValue: Value(storeValue.intValue),
            stringValue: Value(storeValue.stringValue),
          ));
    });
  }

  @override
  FutureOr<void> deleteValue(StoreKey key) {
    return db.transaction(() async {
      await (db.delete(db.store)..where((tbl) => tbl.id.equals(key.id))).go();
    });
  }

  @override
  Stream<List<StoreValue>> watchStore() {
    return (db.select(db.store)).watch();
  }

  @override
  Stream<T?> watchStoreValue<T>(StoreKey key) {
    return (db.select(db.store)..where((tbl) => tbl.id.equals(key.id)))
        .watchSingleOrNull()
        .map((StoreValue? value) => value?.extract(key.type));
  }

  @override
  FutureOr<void> clearStore() {
    return db.transaction(() async {
      await db.delete(db.store).go();
    });
  }
}
