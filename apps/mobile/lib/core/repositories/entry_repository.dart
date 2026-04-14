import 'package:dio/dio.dart';

import '../api/api_client.dart';
import '../api/api_exception.dart';
import '../models/entry.dart';
import '../models/user_home.dart';

class EntryRepository {
  final ApiClient _client;

  EntryRepository(this._client);

  Future<Entry> createOrUpdateEntry({
    int? patientId,
    required DateTime entryDate,
    required double hours,
    required List<String> activities,
    String? note,
    TripInput? trip,
    EntryType entryType = EntryType.patient,
    String? categoryLabel,
  }) async {
    try {
      final response = await _client.dio.post(
        '/mobile/entries',
        data: <String, dynamic>{
          if (patientId != null) 'patient_id': patientId,
          'entry_type': entryType.apiValue,
          if (categoryLabel != null && categoryLabel.isNotEmpty)
            'category_label': categoryLabel,
          'entry_date':
              '${entryDate.year}-${entryDate.month.toString().padLeft(2, '0')}-${entryDate.day.toString().padLeft(2, '0')}',
          'hours': hours,
          'activities': activities,
          'note': note,
          if (trip != null) 'trip': trip.toJson(),
        }..removeWhere((_, v) => v == null),
      );

      if (response.statusCode == 201 || response.statusCode == 200) {
        return Entry.fromJson(response.data as Map<String, dynamic>);
      }

      final data = response.data;
      final detail = (data is Map && data['detail'] != null)
          ? data['detail'].toString()
          : 'Einsatz konnte nicht gespeichert werden';
      throw ApiException(message: detail, statusCode: response.statusCode);
    } on DioException catch (e) {
      throw ApiException.fromDioError(e);
    }
  }

  Future<List<Entry>> listEntries({
    int? patientId,
    int? year,
    int? month,
    String scope = 'mine',
  }) async {
    try {
      final response = await _client.dio.get(
        '/mobile/entries',
        queryParameters: <String, dynamic>{
          'patient_id': patientId,
          'year': year,
          'month': month,
          'scope': scope,
        }..removeWhere((_, v) => v == null),
      );
      if (response.statusCode == 200) {
        final list = response.data as List;
        return list
            .map((e) => Entry.fromJson(e as Map<String, dynamic>))
            .toList();
      }
      throw ApiException(
        message: 'Einsätze konnten nicht geladen werden',
        statusCode: response.statusCode,
      );
    } on DioException catch (e) {
      throw ApiException.fromDioError(e);
    }
  }

  Future<void> deleteEntry(int entryId) async {
    try {
      final response = await _client.dio.delete('/mobile/entries/$entryId');
      if (response.statusCode != 204 && response.statusCode != 200) {
        final data = response.data;
        final detail = (data is Map && data['detail'] != null)
            ? data['detail'].toString()
            : 'Löschen fehlgeschlagen';
        throw ApiException(message: detail, statusCode: response.statusCode);
      }
    } on DioException catch (e) {
      throw ApiException.fromDioError(e);
    }
  }

  Future<PatientHoursSummary> getHoursSummary({
    required int patientId,
    required int year,
    required int month,
  }) async {
    try {
      final response = await _client.dio.get(
        '/mobile/patients/$patientId/hours-summary',
        queryParameters: {'year': year, 'month': month},
      );
      if (response.statusCode == 200) {
        return PatientHoursSummary.fromJson(
          response.data as Map<String, dynamic>,
        );
      }
      throw ApiException(
        message: 'Stunden-Zusammenfassung konnte nicht geladen werden',
        statusCode: response.statusCode,
      );
    } on DioException catch (e) {
      throw ApiException.fromDioError(e);
    }
  }

  /// Wie viele Einsätze hat der User heute schon erfasst?
  /// Wird vom EntryScreen genutzt um zu entscheiden ob der Start-Adresse-
  /// Dialog gezeigt werden soll (nur beim ersten Einsatz des Tages).
  Future<bool> isFirstEntryToday() async {
    try {
      final response = await _client.dio.get('/mobile/entries/today-count');
      if (response.statusCode == 200) {
        final data = response.data as Map<String, dynamic>;
        return (data['is_first'] as bool?) ?? true;
      }
      return true; // Im Zweifel: fragen (defensiv)
    } on DioException {
      return true;
    }
  }

  /// Live-Adress-Autocomplete. Ruft den Backend-Proxy auf, der ORS
  /// anfragt. Mindestens 3 Zeichen, debouncing macht der Caller.
  Future<List<AddressSuggestion>> autocompleteAddress(String query) async {
    if (query.trim().length < 3) return [];
    try {
      final response = await _client.dio.get(
        '/mobile/geocode/autocomplete',
        queryParameters: {'q': query},
      );
      if (response.statusCode == 200 && response.data is List) {
        return (response.data as List)
            .map((e) =>
                AddressSuggestion.fromJson(e as Map<String, dynamic>))
            .toList();
      }
      return [];
    } on DioException {
      return [];
    }
  }

  Future<UserHome?> getUserHome() async {
    try {
      final response = await _client.dio.get('/mobile/user/home');
      if (response.statusCode == 200 && response.data != null) {
        return UserHome.fromJson(response.data as Map<String, dynamic>);
      }
      return null;
    } on DioException {
      return null;
    }
  }

  Future<UserHome> setUserHome(String addressLine) async {
    try {
      final response = await _client.dio.put(
        '/mobile/user/home',
        data: {'address_line': addressLine},
      );
      if (response.statusCode == 200) {
        return UserHome.fromJson(response.data as Map<String, dynamic>);
      }
      throw ApiException(
        message: 'Home-Adresse konnte nicht gespeichert werden',
        statusCode: response.statusCode,
      );
    } on DioException catch (e) {
      throw ApiException.fromDioError(e);
    }
  }
}
