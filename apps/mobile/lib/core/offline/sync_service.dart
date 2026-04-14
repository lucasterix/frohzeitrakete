import 'package:dio/dio.dart';

import '../api/api_client.dart';
import 'offline_queue.dart';

/// Schickt alle Offline-Einsätze an `/mobile/entries` sobald wieder Netz da
/// ist. Wird beim App-Start und bei Connectivity-Change gecallt.
class SyncService {
  final ApiClient _client;

  SyncService(this._client);

  /// Versucht alle pending entries zu synchronisieren.
  /// Returnt wie viele erfolgreich waren.
  Future<SyncResult> flush() async {
    final pending = await OfflineQueue.listAll();
    if (pending.isEmpty) {
      return const SyncResult(synced: 0, failed: 0, remaining: 0);
    }

    int synced = 0;
    int failed = 0;
    for (final item in pending) {
      try {
        final response = await _client.dio.post(
          '/mobile/entries',
          data: item.payload,
        );
        if (response.statusCode == 200 || response.statusCode == 201) {
          await OfflineQueue.remove(item.id);
          synced += 1;
        } else {
          await OfflineQueue.markFailed(
            item.id,
            'HTTP ${response.statusCode}',
          );
          failed += 1;
        }
      } on DioException catch (e) {
        await OfflineQueue.markFailed(item.id, e.message ?? e.toString());
        failed += 1;
        // Bei Netzwerkfehlern abbrechen — der nächste Flush probiert es
        // wieder von vorn.
        if (e.type == DioExceptionType.connectionError ||
            e.type == DioExceptionType.connectionTimeout ||
            e.type == DioExceptionType.sendTimeout ||
            e.type == DioExceptionType.receiveTimeout) {
          break;
        }
      }
    }

    final remaining = await OfflineQueue.count();
    return SyncResult(synced: synced, failed: failed, remaining: remaining);
  }
}

class SyncResult {
  final int synced;
  final int failed;
  final int remaining;

  const SyncResult({
    required this.synced,
    required this.failed,
    required this.remaining,
  });
}
