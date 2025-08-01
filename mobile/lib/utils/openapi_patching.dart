import 'package:openapi/api.dart';

dynamic upgradeDto(dynamic value, String targetType) {
  switch (targetType) {
    case 'UserPreferencesResponseDto':
      if (value is Map) {
        addDefault(value, 'download.includeEmbeddedVideos', false);
        addDefault(value, 'folders', FoldersResponse().toJson());
        addDefault(value, 'memories', MemoriesResponse().toJson());
        addDefault(value, 'ratings', RatingsResponse().toJson());
        addDefault(value, 'people', PeopleResponse().toJson());
        addDefault(value, 'tags', TagsResponse().toJson());
        addDefault(value, 'sharedLinks', SharedLinksResponse().toJson());
        addDefault(value, 'cast', CastResponse().toJson());
        addDefault(value, 'albums', {'defaultAssetOrder': 'desc'});
      }
      break;
    case 'ServerConfigDto':
      if (value is Map) {
        addDefault(value, 'mapLightStyleUrl', 'https://tiles.immich.cloud/v1/style/light.json');
        addDefault(value, 'mapDarkStyleUrl', 'https://tiles.immich.cloud/v1/style/dark.json');
      }
    case 'UserResponseDto':
      if (value is Map) {
        addDefault(value, 'profileChangedAt', DateTime.now().toIso8601String());
      }
      break;
    case 'AssetResponseDto':
      if (value is Map) {
        addDefault(value, 'visibility', 'timeline');
      }
      break;
    case 'UserAdminResponseDto':
      if (value is Map) {
        addDefault(value, 'profileChangedAt', DateTime.now().toIso8601String());
      }
      break;
    case 'LoginResponseDto':
      if (value is Map) {
        addDefault(value, 'isOnboarded', false);
      }
      break;
    case 'SyncUserV1':
      if (value is Map) {
        addDefault(value, 'profileChangedAt', DateTime.now().toIso8601String());
        addDefault(value, 'hasProfileImage', false);
      }
  }
}

addDefault(dynamic value, String keys, dynamic defaultValue) {
  // Loop through the keys and assign the default value if the key is not present
  List<String> keyList = keys.split('.');
  dynamic current = value;

  for (int i = 0; i < keyList.length - 1; i++) {
    if (current[keyList[i]] == null) {
      current[keyList[i]] = {};
    }
    current = current[keyList[i]];
  }

  if (current[keyList.last] == null) {
    current[keyList.last] = defaultValue;
  }
}
