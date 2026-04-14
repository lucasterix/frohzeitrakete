import 'package:dio/dio.dart';

import '../api/api_client.dart';
import '../api/api_exception.dart';
import '../models/notification.dart';

class NotificationRepository {
  final ApiClient _client;

  NotificationRepository(this._client);

  Future<List<AppNotification>> list() async {
    try {
      final response = await _client.dio.get('/mobile/notifications');
      if (response.statusCode == 200) {
        final list = response.data as List;
        return list
            .map((e) => AppNotification.fromJson(e as Map<String, dynamic>))
            .toList();
      }
      throw ApiException(
        message: 'Benachrichtigungen konnten nicht geladen werden',
        statusCode: response.statusCode,
      );
    } on DioException catch (e) {
      throw ApiException.fromDioError(e);
    }
  }

  Future<int> unreadCount() async {
    try {
      final response =
          await _client.dio.get('/mobile/notifications/unread-count');
      if (response.statusCode == 200) {
        final data = response.data as Map<String, dynamic>;
        return (data['count'] as int?) ?? 0;
      }
      return 0;
    } on DioException {
      return 0;
    }
  }

  Future<void> markRead(int id) async {
    try {
      await _client.dio.post('/mobile/notifications/$id/read');
    } on DioException catch (e) {
      throw ApiException.fromDioError(e);
    }
  }

  Future<void> markAllRead() async {
    try {
      await _client.dio.post('/mobile/notifications/read-all');
    } on DioException catch (e) {
      throw ApiException.fromDioError(e);
    }
  }
}
