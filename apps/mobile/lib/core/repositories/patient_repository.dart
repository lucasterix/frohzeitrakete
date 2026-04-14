import 'package:dio/dio.dart';

import '../api/api_client.dart';
import '../api/api_exception.dart';
import '../models/caretaker_history.dart';
import '../models/mobile_patient.dart';
import '../models/patient_budget.dart';

class PatientRepository {
  final ApiClient _client;

  PatientRepository(this._client);

  Future<List<MobilePatient>> getPatients() async {
    try {
      final response = await _client.dio.get('/mobile/patients');
      if (response.statusCode == 200) {
        final list = response.data as List;
        return list
            .map((item) => MobilePatient.fromJson(item as Map<String, dynamic>))
            .toList();
      }
      throw ApiException(
        message: 'Patienten konnten nicht geladen werden',
        statusCode: response.statusCode,
      );
    } on DioException catch (e) {
      throw ApiException.fromDioError(e);
    }
  }

  /// Partial update of patient stammdaten. Only include fields that should
  /// be written – null fields are untouched on the Patti side.
  ///
  /// Passing an empty string for a field clears it in Patti.
  Future<void> updatePatient({
    required int patientId,
    String? phone,
    String? phoneLandline,
    String? insuranceNumber,
    String? birthday,
  }) async {
    try {
      final response = await _client.dio.patch(
        '/mobile/patients/$patientId',
        data: <String, dynamic>{
          'phone': phone,
          'phone_landline': phoneLandline,
          'insurance_number': insuranceNumber,
          'birthday': birthday,
        }..removeWhere((_, v) => v == null),
      );
      if (response.statusCode != 204 && response.statusCode != 200) {
        final data = response.data;
        final detail = (data is Map && data['detail'] != null)
            ? data['detail'].toString()
            : 'Update fehlgeschlagen';
        throw ApiException(message: detail, statusCode: response.statusCode);
      }
    } on DioException catch (e) {
      throw ApiException.fromDioError(e);
    }
  }

  /// Globale Patienten-Suche für den Vertretungs-Fall.
  /// Findet auch Patienten die nicht dem aktuellen User zugewiesen sind.
  Future<List<MobilePatient>> searchPatients(String query) async {
    if (query.trim().length < 2) return [];
    try {
      final response = await _client.dio.get(
        '/mobile/patients/search',
        queryParameters: {'q': query},
      );
      if (response.statusCode == 200) {
        final list = response.data as List;
        return list
            .map((item) => MobilePatient.fromJson(item as Map<String, dynamic>))
            .toList();
      }
      throw ApiException(
        message: 'Suche fehlgeschlagen',
        statusCode: response.statusCode,
      );
    } on DioException catch (e) {
      throw ApiException.fromDioError(e);
    }
  }

  Future<List<CaretakerHistoryEntry>> getCaretakerHistory(int patientId) async {
    try {
      final response = await _client.dio.get(
        '/mobile/patients/$patientId/caretaker-history',
      );
      if (response.statusCode == 200) {
        final list = response.data as List;
        return list
            .map((item) =>
                CaretakerHistoryEntry.fromJson(item as Map<String, dynamic>))
            .toList();
      }
      throw ApiException(
        message: 'Betreuer-Historie konnte nicht geladen werden',
        statusCode: response.statusCode,
      );
    } on DioException catch (e) {
      throw ApiException.fromDioError(e);
    }
  }

  Future<PatientBudget> getPattiBudget({
    required int patientId,
    required int year,
  }) async {
    try {
      final response = await _client.dio.get(
        '/mobile/patients/$patientId/patti-budget',
        queryParameters: {'year': year},
      );
      if (response.statusCode == 200) {
        return PatientBudget.fromJson(response.data as Map<String, dynamic>);
      }
      final data = response.data;
      final detail = (data is Map && data['detail'] != null)
          ? data['detail'].toString()
          : 'Budget konnte nicht geladen werden';
      throw ApiException(message: detail, statusCode: response.statusCode);
    } on DioException catch (e) {
      throw ApiException.fromDioError(e);
    }
  }
}
