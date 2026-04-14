import 'package:dio/dio.dart';

import '../api/api_client.dart';
import '../api/api_exception.dart';

/// Client für Urlaubsanträge, Krankmeldungen, HR-Anfragen und
/// Ankündigungen. Alle Endpoints liegen unter `/mobile/...`.
class OfficeWorkflowRepository {
  final ApiClient _client;
  OfficeWorkflowRepository(this._client);

  Future<Map<String, dynamic>> createVacationRequest({
    required DateTime fromDate,
    required DateTime toDate,
    String? note,
  }) async {
    try {
      final response = await _client.dio.post(
        '/mobile/vacation-requests',
        data: {
          'from_date': _fmtDate(fromDate),
          'to_date': _fmtDate(toDate),
          if (note != null && note.isNotEmpty) 'note': note,
        },
      );
      return response.data as Map<String, dynamic>;
    } on DioException catch (e) {
      throw ApiException.fromDioError(e);
    }
  }

  Future<List<Map<String, dynamic>>> listMyVacationRequests() async {
    try {
      final response =
          await _client.dio.get('/mobile/vacation-requests');
      return (response.data as List)
          .map((e) => (e as Map).cast<String, dynamic>())
          .toList();
    } on DioException catch (e) {
      throw ApiException.fromDioError(e);
    }
  }

  Future<Map<String, dynamic>> createSickLeave({
    required DateTime fromDate,
    required DateTime toDate,
    String? note,
  }) async {
    try {
      final response = await _client.dio.post(
        '/mobile/sick-leaves',
        data: {
          'from_date': _fmtDate(fromDate),
          'to_date': _fmtDate(toDate),
          if (note != null && note.isNotEmpty) 'note': note,
        },
      );
      return response.data as Map<String, dynamic>;
    } on DioException catch (e) {
      throw ApiException.fromDioError(e);
    }
  }

  Future<List<Map<String, dynamic>>> listMySickLeaves() async {
    try {
      final response = await _client.dio.get('/mobile/sick-leaves');
      return (response.data as List)
          .map((e) => (e as Map).cast<String, dynamic>())
          .toList();
    } on DioException catch (e) {
      throw ApiException.fromDioError(e);
    }
  }

  Future<Map<String, dynamic>> createHrRequest({
    required String category,
    required String subject,
    String? body,
  }) async {
    try {
      final response = await _client.dio.post(
        '/mobile/hr-requests',
        data: {
          'category': category,
          'subject': subject,
          if (body != null && body.isNotEmpty) 'body': body,
        },
      );
      return response.data as Map<String, dynamic>;
    } on DioException catch (e) {
      throw ApiException.fromDioError(e);
    }
  }

  Future<List<Map<String, dynamic>>> listMyHrRequests() async {
    try {
      final response = await _client.dio.get('/mobile/hr-requests');
      return (response.data as List)
          .map((e) => (e as Map).cast<String, dynamic>())
          .toList();
    } on DioException catch (e) {
      throw ApiException.fromDioError(e);
    }
  }

  Future<List<Map<String, dynamic>>> listAnnouncements() async {
    try {
      final response = await _client.dio.get('/mobile/announcements');
      return (response.data as List)
          .map((e) => (e as Map).cast<String, dynamic>())
          .toList();
    } on DioException catch (e) {
      throw ApiException.fromDioError(e);
    }
  }

  Future<Map<String, dynamic>> todayStatus() async {
    try {
      final response = await _client.dio.get('/mobile/today-status');
      return (response.data as Map).cast<String, dynamic>();
    } on DioException catch (e) {
      throw ApiException.fromDioError(e);
    }
  }

  String _fmtDate(DateTime d) =>
      '${d.year}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';
}
