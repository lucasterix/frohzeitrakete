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
    // Auto-Refresh Interceptor: wenn der Access-Token abgelaufen ist
    // und der Backend-Call 401 zurückgibt, rufen wir /auth/refresh auf
    // und wiederholen den ursprünglichen Request einmal. Refresh selbst
    // läuft mit dem Refresh-Cookie, kein User-Input nötig.
    _dio.interceptors.add(
      QueuedInterceptorsWrapper(
        onResponse: (response, handler) async {
          final status = response.statusCode ?? 0;
          final path = response.requestOptions.path;
          final isAuthRoute = path.startsWith('/auth/refresh') ||
              path.startsWith('/auth/login') ||
              path.startsWith('/auth/logout');
          if (status == 401 && !isAuthRoute) {
            try {
              final refreshed = await _dio.post('/auth/refresh');
              if ((refreshed.statusCode ?? 0) == 200) {
                final retry = await _dio.fetch(response.requestOptions);
                return handler.resolve(retry);
              }
            } on DioException catch (_) {
              // refresh failed → leave original 401 in place
            } catch (_) {}
          }
          handler.next(response);
        },
      ),
    );
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
