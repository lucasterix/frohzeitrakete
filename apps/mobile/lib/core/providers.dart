import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'api/api_client.dart';
import 'models/caretaker_history.dart';
import 'models/entry.dart';
import 'models/mobile_patient.dart';
import 'models/patient_budget.dart';
import 'models/patient_extras.dart';
import 'models/signature_event.dart';
import 'models/user.dart';
import 'models/notification.dart';
import 'repositories/auth_repository.dart';
import 'repositories/entry_repository.dart';
import 'repositories/notification_repository.dart';
import 'repositories/office_workflow_repository.dart';
import 'repositories/patient_intake_repository.dart';
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

final notificationRepositoryProvider = Provider<NotificationRepository>(
  (ref) => NotificationRepository(ref.watch(apiClientProvider)),
);

final patientIntakeRepositoryProvider = Provider<PatientIntakeRepository>(
  (ref) => PatientIntakeRepository(ref.watch(apiClientProvider)),
);

final officeWorkflowRepositoryProvider = Provider<OfficeWorkflowRepository>(
  (ref) => OfficeWorkflowRepository(ref.watch(apiClientProvider)),
);

final myVacationRequestsProvider =
    FutureProvider<List<Map<String, dynamic>>>((ref) async {
  return ref.read(officeWorkflowRepositoryProvider).listMyVacationRequests();
});

final mySickLeavesProvider =
    FutureProvider<List<Map<String, dynamic>>>((ref) async {
  return ref.read(officeWorkflowRepositoryProvider).listMySickLeaves();
});

final myHrRequestsProvider =
    FutureProvider<List<Map<String, dynamic>>>((ref) async {
  return ref.read(officeWorkflowRepositoryProvider).listMyHrRequests();
});

final announcementsProvider =
    FutureProvider<List<Map<String, dynamic>>>((ref) async {
  return ref.read(officeWorkflowRepositoryProvider).listAnnouncements();
});

final todayStatusProvider = FutureProvider<Map<String, dynamic>>((ref) async {
  return ref.read(officeWorkflowRepositoryProvider).todayStatus();
});

final notificationsProvider =
    FutureProvider<List<AppNotification>>((ref) async {
  final repo = ref.watch(notificationRepositoryProvider);
  return repo.list();
});

final unreadNotificationCountProvider = FutureProvider<int>((ref) async {
  final repo = ref.watch(notificationRepositoryProvider);
  return repo.unreadCount();
});

final patientSignaturesProvider =
    FutureProvider.family<List<SignatureEvent>, int>((ref, patientId) async {
  final repo = ref.watch(signatureRepositoryProvider);
  return repo.getSignaturesForPatient(patientId);
});

final orgContactProvider =
    FutureProvider<Map<String, dynamic>>((ref) async {
  final client = ref.watch(apiClientProvider);
  final response = await client.dio.get('/mobile/org-contact');
  return (response.data as Map).cast<String, dynamic>();
});

final trainingsProvider =
    FutureProvider<List<Map<String, dynamic>>>((ref) async {
  final client = ref.watch(apiClientProvider);
  final response = await client.dio.get('/mobile/trainings');
  final list = response.data as List;
  return list.map((e) => (e as Map).cast<String, dynamic>()).toList();
});

class MonthParams {
  final int year;
  final int month;
  const MonthParams(this.year, this.month);

  @override
  bool operator ==(Object other) =>
      other is MonthParams && other.year == year && other.month == month;

  @override
  int get hashCode => year.hashCode ^ month.hashCode;
}

final userMonthlySummaryProvider =
    FutureProvider.family<Map<String, dynamic>, MonthParams>(
        (ref, params) async {
  final client = ref.watch(apiClientProvider);
  final response = await client.dio.get(
    '/mobile/user/monthly-summary',
    queryParameters: {'year': params.year, 'month': params.month},
  );
  return (response.data as Map).cast<String, dynamic>();
});

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

  /// Beim App-Start: falls Cookies noch gültig sind, /auth/me aufrufen und
  /// ohne erneuten Login in die App gehen. Wenn Cookies abgelaufen sind
  /// oder /auth/me fehlschlägt bleiben wir im "data(null)"-State und der
  /// LoginScreen wird gezeigt.
  Future<void> restoreSession() async {
    try {
      final user = await _authRepo.me();
      if (user != null) {
        state = AsyncValue.data(user);
      }
    } catch (_) {
      // ignore – einfach im ausgeloggten Zustand bleiben
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

/// Convenience: aktueller User oder null.
final currentUserProvider = Provider<User?>(
  (ref) => ref.watch(authControllerProvider).valueOrNull,
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
  // Im PatientDetail wollen wir ALLE Einsätze sehen (auch von Vertretungs-
  // Kollegen), daher scope=patient.
  return repo.listEntries(
    patientId: params.patientId,
    year: params.year,
    month: params.month,
    scope: 'patient',
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

// ---------------- Caretaker History ----------------

final caretakerHistoryProvider =
    FutureProvider.family<List<CaretakerHistoryEntry>, int>(
  (ref, patientId) async {
    final auth = ref.watch(authControllerProvider);
    if (auth.valueOrNull == null) return [];
    final repo = ref.watch(patientRepositoryProvider);
    return repo.getCaretakerHistory(patientId);
  },
);

final patientExtrasProvider = FutureProvider.family<PatientExtras, int>(
  (ref, patientId) async {
    final auth = ref.watch(authControllerProvider);
    if (auth.valueOrNull == null) {
      throw StateError('Not authenticated');
    }
    final repo = ref.watch(patientRepositoryProvider);
    return repo.getPatientExtras(patientId);
  },
);

// ---------------- Signatures ----------------

/// Alle Signaturen die der aktuelle User selbst aufgenommen hat.
/// Quelle: GET /mobile/signatures
final mySignaturesProvider = FutureProvider<List<SignatureEvent>>((ref) async {
  final auth = ref.watch(authControllerProvider);
  if (auth.valueOrNull == null) return [];
  final repo = ref.watch(signatureRepositoryProvider);
  return repo.getMySignatures();
});

// ---------------- My Recent Entries ----------------

/// Alle Eins\u00e4tze des aktuellen Users (optional gefiltert nach year/month).
/// Genutzt f\u00fcr HomeScreen-Stats und CalendarScreen.
class MyEntriesParams {
  final int? year;
  final int? month;

  const MyEntriesParams({this.year, this.month});

  @override
  bool operator ==(Object other) =>
      other is MyEntriesParams && other.year == year && other.month == month;

  @override
  int get hashCode => Object.hash(year, month);
}

final myEntriesProvider =
    FutureProvider.family<List<Entry>, MyEntriesParams>((ref, params) async {
  final auth = ref.watch(authControllerProvider);
  if (auth.valueOrNull == null) return [];
  final repo = ref.watch(entryRepositoryProvider);
  return repo.listEntries(year: params.year, month: params.month);
});
