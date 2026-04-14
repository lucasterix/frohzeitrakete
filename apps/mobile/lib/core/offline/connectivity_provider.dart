import 'dart:async';

import 'package:connectivity_plus/connectivity_plus.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../providers.dart';
import 'offline_queue.dart';
import 'sync_service.dart';

/// true wenn das Gerät gerade Netz hat (wifi oder mobile).
final connectivityStreamProvider = StreamProvider<bool>((ref) async* {
  final connectivity = Connectivity();
  final initial = await connectivity.checkConnectivity();
  yield _hasNet(initial);
  yield* connectivity.onConnectivityChanged.map(_hasNet);
});

bool _hasNet(List<ConnectivityResult> results) {
  return results.any(
    (r) =>
        r == ConnectivityResult.wifi ||
        r == ConnectivityResult.mobile ||
        r == ConnectivityResult.ethernet,
  );
}

final syncServiceProvider = Provider<SyncService>(
  (ref) => SyncService(ref.watch(apiClientProvider)),
);

/// Anzahl pending offline-Einsätze. Wird manuell invalidated wenn
/// etwas enqueued oder sync'd wurde.
final pendingOfflineCountProvider = FutureProvider<int>((ref) async {
  return OfflineQueue.count();
});

/// Beim App-Start und bei jedem "online"-Wechsel einmal flushen.
final offlineSyncKickoffProvider = Provider<void>((ref) {
  final online = ref.watch(connectivityStreamProvider).maybeWhen(
        data: (o) => o,
        orElse: () => false,
      );
  if (online) {
    Future(() async {
      final result = await ref.read(syncServiceProvider).flush();
      if (result.synced > 0) {
        ref.invalidate(pendingOfflineCountProvider);
        // Entries provider invalidieren damit die UI die neuen sieht
        ref.invalidate(myEntriesProvider);
      }
    });
  }
});
