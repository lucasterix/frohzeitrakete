import 'package:cookie_jar/cookie_jar.dart';
import 'package:dio/dio.dart';
import 'package:dio_cookie_manager/dio_cookie_manager.dart';

import 'api_config.dart';

/// Zentraler HTTP-Client für FrohZeit Backend.
///
/// Backend nutzt Cookie-basiertes Auth (fz_access_token / fz_refresh_token).
/// Der CookieJar speichert Cookies in-memory. Nach App-Neustart muss der User
/// sich neu anmelden (kein Persistenz-Layer im MVP).
class ApiClient {
  late final Dio _dio;
  late final CookieJar _cookieJar;

  ApiClient() {
    _cookieJar = CookieJar();
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
        // Erlaube 4xx als "normale" Responses – wir werfen selbst
        validateStatus: (status) => status != null && status < 500,
      ),
    );
    _dio.interceptors.add(CookieManager(_cookieJar));
  }

  Dio get dio => _dio;

  /// L\u00f6scht alle Cookies (Logout-Fallback).
  Future<void> clearCookies() async {
    await _cookieJar.deleteAll();
  }

  /// Pr\u00fcft ob \u00fcberhaupt ein Access-Cookie vorliegt.
  Future<bool> hasAuthCookie() async {
    final uri = Uri.parse(ApiConfig.baseUrl);
    final cookies = await _cookieJar.loadForRequest(uri);
    return cookies.any((c) => c.name == 'fz_access_token');
  }
}
