/// Key for each possible value in the `Store`.
/// Defines the data type for each value
enum StoreKey<T> {
  // Server endpoint related stores
  accessToken<String>(0, type: String),
  serverEndpoint<String>(1, type: String),
  ;

  const StoreKey(this.id, {required this.type});
  final int id;
  final Type type;
}
