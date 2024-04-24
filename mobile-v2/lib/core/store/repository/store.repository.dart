import 'dart:async';

import 'package:immich_mobile/core/store/model/store_key.model.dart';
import 'package:immich_mobile/core/store/model/store_value.model.dart';

abstract class StoreRepository {
  FutureOr<T?> getValue<T>(StoreKey key);

  FutureOr<void> setValue<T>(StoreKey<T> key, T value);

  FutureOr<void> deleteValue(StoreKey key);

  Stream<List<StoreValue>> watchStore();

  Stream<T?> watchStoreValue<T>(StoreKey key);

  FutureOr<void> clearStore();
}
