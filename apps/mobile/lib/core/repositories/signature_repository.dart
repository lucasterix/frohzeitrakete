import 'package:dio/dio.dart';

import '../api/api_client.dart';
import '../api/api_exception.dart';
import '../models/signature_event.dart';

class SignatureRepository {
  final ApiClient _client;

  SignatureRepository(this._client);

  /// POST /mobile/signatures
  ///
  /// [signerName] ist der Name der unterschreibenden Person:
  /// - Für Leistungsnachweis/Pflegeumwandlung: Patient selbst
  /// - Für VP-Antrag: Name der Pflegeperson (manuell eingegeben)
  Future<SignatureEvent> createSignature({
    required int patientId,
    required DocumentType documentType,
    required String signerName,
    required String svgContent,
    int? width,
    int? height,
    String? note,
    DateTime? signedAt,
  }) async {
    try {
      final response = await _client.dio.post(
        '/mobile/signatures',
        data: <String, dynamic>{
          'patient_id': patientId,
          'document_type': documentType.apiValue,
          'signer_name': signerName,
          'svg_content': svgContent,
          'width': width,
          'height': height,
          'note': note,
          'signed_at': signedAt?.toIso8601String(),
        }..removeWhere((_, v) => v == null),
      );

      if (response.statusCode == 201 || response.statusCode == 200) {
        return SignatureEvent.fromJson(response.data as Map<String, dynamic>);
      }

      final data = response.data;
      final detail = (data is Map && data['detail'] != null)
          ? data['detail'].toString()
          : 'Signatur konnte nicht gespeichert werden';
      throw ApiException(
        message: detail,
        statusCode: response.statusCode,
      );
    } on DioException catch (e) {
      throw ApiException.fromDioError(e);
    }
  }

  Future<List<SignatureEvent>> getSignaturesForPatient(int patientId) async {
    try {
      final response =
          await _client.dio.get('/mobile/patients/$patientId/signatures');
      if (response.statusCode == 200) {
        final list = response.data as List;
        return list
            .map((item) =>
                SignatureEvent.fromJson(item as Map<String, dynamic>))
            .toList();
      }
      throw ApiException(
        message: 'Signaturen konnten nicht geladen werden',
        statusCode: response.statusCode,
      );
    } on DioException catch (e) {
      throw ApiException.fromDioError(e);
    }
  }

  Future<List<SignatureEvent>> getMySignatures() async {
    try {
      final response = await _client.dio.get('/mobile/signatures');
      if (response.statusCode == 200) {
        final list = response.data as List;
        return list
            .map((item) =>
                SignatureEvent.fromJson(item as Map<String, dynamic>))
            .toList();
      }
      throw ApiException(
        message: 'Signaturen konnten nicht geladen werden',
        statusCode: response.statusCode,
      );
    } on DioException catch (e) {
      throw ApiException.fromDioError(e);
    }
  }
}
