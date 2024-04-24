import 'package:drift/drift.dart';
import 'package:immich_mobile/core/store/model/store_value.model.dart';

@UseRowClass(StoreValue)
class Store extends Table {
  const Store();

  @override
  String get tableName => 'store';

  IntColumn get id => integer().autoIncrement()();
  IntColumn get intValue => integer().nullable()();
  TextColumn get stringValue => text().nullable()();
}
