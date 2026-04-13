import 'package:dio/dio.dart';

import '../api/api_client.dart';
import '../api/api_exception.dart';
import '../models/user.dart';

class AuthRepository {
  final ApiClient _client;

  AuthRepository(this._client);

  Future<User> login({
    required String email,
    required String password,
  }) async {
    try {
      final response = await _client.dio.post(
        '/auth/login',
        data: {'email': email, 'password': password},
      );

      if (response.statusCode == 200) {
        final data = response.data as Map<String, dynamic>;
        return User.fromJson(data['user'] as Map<String, dynamic>);
      }

      // 400/401 mit detail-Feld
      final data = response.data;
      final detail = (data is Map && data['detail'] != null)
          ? data['detail'].toString()
          : 'Anmeldung fehlgeschlagen';
      throw ApiException(
        message: detail,
        statusCode: response.statusCode,
        isAuthError: true,
      );
    } on DioException catch (e) {
      throw ApiException.fromDioError(e);
    }
  }

  Future<User?> me() async {
    try {
      final response = await _client.dio.get('/auth/me');
      if (response.statusCode == 200) {
        return User.fromJson(response.data as Map<String, dynamic>);
      }
      return null;
    } on DioException {
      return null;
    }
  }

  Future<void> logout() async {
    try {
      await _client.dio.post('/auth/logout');
    } on DioException {
      // Auch bei Fehler trotzdem lokal abmelden
    } finally {
      await _client.clearCookies();
    }
  }
}
