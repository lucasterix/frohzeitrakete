import 'package:dio/dio.dart';

import '../api/api_client.dart';
import '../api/api_exception.dart';

class PatientIntakeRepository {
  final ApiClient _client;

  PatientIntakeRepository(this._client);

  Future<Map<String, dynamic>> create({
    required String fullName,
    required String phone,
    String? birthdate,
    String? address,
    String? contactPerson,
    String? careLevel,
    String? note,
  }) async {
    try {
      final response = await _client.dio.post(
        '/mobile/patient-intakes',
        data: <String, dynamic>{
          'full_name': fullName,
          'birthdate': birthdate,
          'address': address,
          'phone': phone,
          'contact_person': contactPerson,
          'care_level': careLevel,
          'note': note,
        }..removeWhere((_, v) => v == null),
      );
      if (response.statusCode == 200 || response.statusCode == 201) {
        return response.data as Map<String, dynamic>;
      }
      throw ApiException(
        message: 'Neuaufnahme konnte nicht gesendet werden',
        statusCode: response.statusCode,
      );
    } on DioException catch (e) {
      throw ApiException.fromDioError(e);
    }
  }
}
