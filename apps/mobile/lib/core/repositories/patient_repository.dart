import 'package:dio/dio.dart';

import '../api/api_client.dart';
import '../api/api_exception.dart';
import '../models/mobile_patient.dart';

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
}
