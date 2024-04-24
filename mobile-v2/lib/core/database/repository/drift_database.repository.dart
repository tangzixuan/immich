import 'dart:io';

import 'package:drift/drift.dart';
import 'package:drift/native.dart';
import 'package:immich_mobile/core/database/repository/database.repository.dart';
import 'package:immich_mobile/core/log/model/log_message.drift.dart';
import 'package:immich_mobile/core/store/model/store.drift.dart';
import 'package:path/path.dart' as p;
import 'package:path_provider/path_provider.dart';
import 'package:sqlite3/sqlite3.dart';
import 'package:sqlite3_flutter_libs/sqlite3_flutter_libs.dart';
import 'package:immich_mobile/core/log/model/log_message.model.dart';
import 'package:immich_mobile/core/store/model/store_value.model.dart';

part 'drift_database.repository.g.dart';

@DriftDatabase(tables: [Logs, Store])
class DriftDatabaseRepository extends _$DriftDatabaseRepository
    implements DatabaseRepository<GeneratedDatabase> {
  DriftDatabaseRepository() : super(_openConnection());

  static LazyDatabase _openConnection() {
    // the LazyDatabase util lets us find the right location for the file async.
    return LazyDatabase(() async {
      // put the database file, called db.sqlite here, into the documents folder
      // for your app.
      final dbFolder = await getApplicationDocumentsDirectory();
      final file = File(p.join(dbFolder.path, 'db.sqlite'));

      // Also work around limitations on old Android versions
      // https://github.com/simolus3/sqlite3.dart/tree/main/sqlite3_flutter_libs#problems-on-android-6
      if (Platform.isAndroid) {
        await applyWorkaroundToOpenSqlite3OnOldAndroidVersions();
      }

      // Make sqlite3 pick a more suitable location for temporary files - the
      // one from the system may be inaccessible due to sandboxing.
      // https://github.com/simolus3/moor/issues/876#issuecomment-710013503
      final cachebase = (await getTemporaryDirectory()).path;
      // We can't access /tmp on Android, which sqlite3 would try by default.
      // Explicitly tell it about the correct temporary directory.
      sqlite3.tempDirectory = cachebase;

      return NativeDatabase.createInBackground(file);
    });
  }

  @override
  GeneratedDatabase init() => this;

  @override
  int get schemaVersion => 1;

  @override
  void migrateDB() {
    // TODO: implement migrateDB
  }
}
