import 'package:drift/drift.dart';
import 'package:immich_mobile/core/log/model/log_message.model.dart';
import 'package:immich_mobile/core/database/repository/drift_database.repository.dart';
import 'package:immich_mobile/core/log/repository/log.repository.dart';

class LogDriftRepository implements LogRepository {
  final DriftDatabaseRepository db;

  const LogDriftRepository(this.db);

  @override
  Future<List<LogMessage>> fetchLogs() async {
    return await db.select(db.logs).get();
  }

  @override
  Future<void> truncateLogs({int limit = 250}) {
    return db.transaction(() async {
      final idsToRetain = await (db.select(db.logs)
            ..orderBy([(tbl) => OrderingTerm.desc(tbl.createdAt)])
            ..limit(limit))
          .map<int?>((LogMessage? row) => row?.id)
          .get();

      db.delete(db.logs)..where((tbl) => tbl.id.isNotIn(idsToRetain.nonNulls));
    });
  }
}
