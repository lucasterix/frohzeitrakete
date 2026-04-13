import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'api/api_client.dart';
import 'models/entry.dart';
import 'models/mobile_patient.dart';
import 'models/patient_budget.dart';
import 'models/user.dart';
import 'repositories/auth_repository.dart';
import 'repositories/entry_repository.dart';
import 'repositories/patient_repository.dart';
import 'repositories/signature_repository.dart';

// ---------------- Infrastructure ----------------

final apiClientProvider = Provider<ApiClient>((ref) => ApiClient());

final authRepositoryProvider = Provider<AuthRepository>(
  (ref) => AuthRepository(ref.watch(apiClientProvider)),
);

final patientRepositoryProvider = Provider<PatientRepository>(
  (ref) => PatientRepository(ref.watch(apiClientProvider)),
);

final signatureRepositoryProvider = Provider<SignatureRepository>(
  (ref) => SignatureRepository(ref.watch(apiClientProvider)),
);

final entryRepositoryProvider = Provider<EntryRepository>(
  (ref) => EntryRepository(ref.watch(apiClientProvider)),
);

// ---------------- Auth State ----------------

/// Aktuell eingeloggter User (null = nicht eingeloggt).
class AuthController extends StateNotifier<AsyncValue<User?>> {
  final AuthRepository _authRepo;

  AuthController(this._authRepo) : super(const AsyncValue.data(null));

  Future<void> login(String email, String password) async {
    state = const AsyncValue.loading();
    try {
      final user = await _authRepo.login(email: email, password: password);
      state = AsyncValue.data(user);
    } catch (e, st) {
      state = AsyncValue.error(e, st);
      rethrow;
    }
  }

  Future<void> logout() async {
    await _authRepo.logout();
    state = const AsyncValue.data(null);
  }

  bool get isLoggedIn => state.valueOrNull != null;
}

final authControllerProvider =
    StateNotifierProvider<AuthController, AsyncValue<User?>>(
  (ref) => AuthController(ref.watch(authRepositoryProvider)),
);

// ---------------- Patient List ----------------

final patientsProvider = FutureProvider<List<MobilePatient>>((ref) async {
  // Nur laden wenn eingeloggt
  final auth = ref.watch(authControllerProvider);
  if (auth.valueOrNull == null) return [];

  final repo = ref.watch(patientRepositoryProvider);
  return repo.getPatients();
});

// ---------------- Entries ----------------

/// Einsätze des aktuellen Users, gefiltert nach Patient + (optional) Monat.
class EntryListParams {
  final int patientId;
  final int? year;
  final int? month;

  const EntryListParams({
    required this.patientId,
    this.year,
    this.month,
  });

  @override
  bool operator ==(Object other) =>
      other is EntryListParams &&
      other.patientId == patientId &&
      other.year == year &&
      other.month == month;

  @override
  int get hashCode => Object.hash(patientId, year, month);
}

final patientEntriesProvider =
    FutureProvider.family<List<Entry>, EntryListParams>((ref, params) async {
  final auth = ref.watch(authControllerProvider);
  if (auth.valueOrNull == null) return [];
  final repo = ref.watch(entryRepositoryProvider);
  return repo.listEntries(
    patientId: params.patientId,
    year: params.year,
    month: params.month,
  );
});

/// Hours-summary für Reststunden-Anzeige.
class HoursSummaryParams {
  final int patientId;
  final int year;
  final int month;

  const HoursSummaryParams({
    required this.patientId,
    required this.year,
    required this.month,
  });

  @override
  bool operator ==(Object other) =>
      other is HoursSummaryParams &&
      other.patientId == patientId &&
      other.year == year &&
      other.month == month;

  @override
  int get hashCode => Object.hash(patientId, year, month);
}

final hoursSummaryProvider =
    FutureProvider.family<PatientHoursSummary, HoursSummaryParams>(
  (ref, params) async {
    final auth = ref.watch(authControllerProvider);
    if (auth.valueOrNull == null) {
      return PatientHoursSummary(
        patientId: params.patientId,
        year: params.year,
        month: params.month,
        usedHours: 0,
        entriesCount: 0,
        isLocked: false,
      );
    }
    final repo = ref.watch(entryRepositoryProvider);
    return repo.getHoursSummary(
      patientId: params.patientId,
      year: params.year,
      month: params.month,
    );
  },
);

// ---------------- Patti Budget ----------------

/// Live-Budget aus Patti (Pflegesachleistung + Verhinderungspflege).
class PattiBudgetParams {
  final int patientId;
  final int year;

  const PattiBudgetParams({required this.patientId, required this.year});

  @override
  bool operator ==(Object other) =>
      other is PattiBudgetParams &&
      other.patientId == patientId &&
      other.year == year;

  @override
  int get hashCode => Object.hash(patientId, year);
}

final pattiBudgetProvider =
    FutureProvider.family<PatientBudget, PattiBudgetParams>(
  (ref, params) async {
    final auth = ref.watch(authControllerProvider);
    if (auth.valueOrNull == null) {
      throw StateError('Not authenticated');
    }
    final repo = ref.watch(patientRepositoryProvider);
    return repo.getPattiBudget(
      patientId: params.patientId,
      year: params.year,
    );
  },
);
