import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'api/api_client.dart';
import 'models/mobile_patient.dart';
import 'models/user.dart';
import 'repositories/auth_repository.dart';
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
