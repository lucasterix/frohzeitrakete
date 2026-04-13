import 'package:dio/dio.dart';

/// Alle API-Fehler, die im UI angezeigt werden können.
class ApiException implements Exception {
  final String message;
  final int? statusCode;
  final bool isNetworkError;
  final bool isAuthError;

  const ApiException({
    required this.message,
    this.statusCode,
    this.isNetworkError = false,
    this.isAuthError = false,
  });

  factory ApiException.fromDioError(DioException e) {
    // Keine Verbindung / Timeout / DNS
    if (e.type == DioExceptionType.connectionTimeout ||
        e.type == DioExceptionType.receiveTimeout ||
        e.type == DioExceptionType.sendTimeout ||
        e.type == DioExceptionType.connectionError) {
      return const ApiException(
        message:
            'Keine Verbindung zum Server. Bitte Internetverbindung prüfen.',
        isNetworkError: true,
      );
    }

    final status = e.response?.statusCode;
    final data = e.response?.data;

    // Server-Antwort mit "detail"-Feld auslesen
    String detail = 'Unbekannter Fehler';
    if (data is Map && data['detail'] != null) {
      detail = data['detail'].toString();
    } else if (e.message != null) {
      detail = e.message!;
    }

    if (status == 401) {
      return ApiException(
        message: 'Anmeldung fehlgeschlagen: $detail',
        statusCode: 401,
        isAuthError: true,
      );
    }

    if (status == 403) {
      return ApiException(
        message: 'Keine Berechtigung: $detail',
        statusCode: 403,
      );
    }

    if (status == 404) {
      return ApiException(
        message: 'Nicht gefunden: $detail',
        statusCode: 404,
      );
    }

    if (status != null && status >= 500) {
      return ApiException(
        message: 'Server-Fehler. Bitte später erneut versuchen.',
        statusCode: status,
      );
    }

    return ApiException(
      message: detail,
      statusCode: status,
    );
  }

  @override
  String toString() => message;
}
