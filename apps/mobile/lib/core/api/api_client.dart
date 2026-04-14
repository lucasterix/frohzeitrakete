import 'package:cookie_jar/cookie_jar.dart';
import 'package:dio/dio.dart';
import 'package:dio_cookie_manager/dio_cookie_manager.dart';
import 'package:path_provider/path_provider.dart';

import 'api_config.dart';

/// Zentraler HTTP-Client für FrohZeit Backend.
///
/// Backend nutzt Cookie-basiertes Auth (fz_access_token / fz_refresh_token).
/// Cookies werden in einem PersistCookieJar auf der Platte gespeichert
/// damit der User beim App-Neustart eingeloggt bleibt.
class ApiClient {
  late final Dio _dio;
  CookieJar? _cookieJar;
  Future<void>? _initFuture;

  ApiClient() {
    _dio = Dio(
      BaseOptions(
        baseUrl: ApiConfig.baseUrl,
        connectTimeout: ApiConfig.connectTimeout,
        receiveTimeout: ApiConfig.receiveTimeout,
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'X-Device-Name': 'FrohZeit Mobile',
        },
        validateStatus: (status) => status != null && status < 500,
      ),
    );
    _initFuture = _initPersistentJar();
  }

  Future<void> _initPersistentJar() async {
    try {
      final dir = await getApplicationDocumentsDirectory();
      final jar = PersistCookieJar(
        ignoreExpires: false,
        storage: FileStorage('${dir.path}/.frohzeit_cookies/'),
      );
      _cookieJar = jar;
      _dio.interceptors.add(CookieManager(jar));
    } catch (e) {
      // Fallback zu in-memory wenn Filesystem nicht verfügbar
      _cookieJar = CookieJar();
      _dio.interceptors.add(CookieManager(_cookieJar!));
    }
  }

  /// Stellt sicher dass der CookieJar bereit ist bevor der erste Request geht.
  Future<void> ready() async {
    await _initFuture;
  }

  Dio get dio => _dio;

  /// Löscht alle Cookies (Logout-Fallback).
  Future<void> clearCookies() async {
    await ready();
    await _cookieJar?.deleteAll();
  }

  /// Prüft ob überhaupt ein Access-Cookie vorliegt.
  Future<bool> hasAuthCookie() async {
    await ready();
    final jar = _cookieJar;
    if (jar == null) return false;
    final uri = Uri.parse(ApiConfig.baseUrl);
    final cookies = await jar.loadForRequest(uri);
    return cookies.any((c) => c.name == 'fz_access_token');
  }
}
