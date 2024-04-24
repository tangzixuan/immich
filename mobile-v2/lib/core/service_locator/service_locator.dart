import 'package:get_it/get_it.dart';
import 'package:immich_mobile/core/database/repository/drift_database.repository.dart';
import 'package:immich_mobile/core/log/repository/log.repository.dart';
import 'package:immich_mobile/core/log/repository/log_drift.repository.dart';
import 'package:immich_mobile/core/store/repository/store.repository.dart';
import 'package:immich_mobile/core/store/repository/store_drift.repository.dart';
import 'package:immich_mobile/core/store/store_manager.dart';

/// Ambient instance
final getIt = GetIt.instance;

class ServiceLocator {
  const ServiceLocator._internal();

  static void configureServices() {
    // Register DB
    getIt.registerSingleton<DriftDatabaseRepository>(DriftDatabaseRepository());
    _registerCoreServices();
  }

  static void _registerCoreServices() {
    // Init store
    getIt.registerFactory<StoreRepository>(() => StoreDriftRepository(getIt()));
    getIt.registerSingleton<StoreManager>(StoreManager(getIt()));
    // Logs
    getIt.registerFactory<LogRepository>(() => LogDriftRepository(getIt()));
  }
}
