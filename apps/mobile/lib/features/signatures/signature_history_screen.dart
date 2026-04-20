import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/models/signature_event.dart';
import '../../core/providers.dart';

const _green = Color(0xFF4F8A5B);

class SignatureHistoryScreen extends ConsumerWidget {
  final int patientId;
  final String patientName;

  const SignatureHistoryScreen({
    super.key,
    required this.patientId,
    required this.patientName,
  });

  String _formatDate(DateTime dt) {
    final local = dt.toLocal();
    return '${local.day.toString().padLeft(2, '0')}.${local.month.toString().padLeft(2, '0')}.${local.year} '
        '${local.hour.toString().padLeft(2, '0')}:${local.minute.toString().padLeft(2, '0')}';
  }

  IconData _iconFor(DocumentType type) {
    switch (type) {
      case DocumentType.leistungsnachweis:
        return Icons.receipt_long_outlined;
      case DocumentType.vpAntrag:
        return Icons.description_outlined;
      case DocumentType.pflegeumwandlung:
        return Icons.sync_alt_outlined;
      case DocumentType.betreuungsvertrag:
        return Icons.assignment_turned_in_outlined;
      case DocumentType.pflegeantragHilfsmittel:
        return Icons.medical_services_outlined;
    }
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(patientSignaturesProvider(patientId));

    return Scaffold(
      appBar: AppBar(
        title: const Text('Unterschriften'),
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh),
            onPressed: () =>
                ref.invalidate(patientSignaturesProvider(patientId)),
          ),
        ],
      ),
      body: async.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(
          child: Padding(
            padding: const EdgeInsets.all(24),
            child: Text('Fehler:\n$e', textAlign: TextAlign.center),
          ),
        ),
        data: (items) {
          if (items.isEmpty) {
            return Center(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  const Icon(Icons.draw_outlined,
                      size: 56, color: Colors.black26),
                  const SizedBox(height: 12),
                  Text(
                    'Noch keine Unterschriften für $patientName',
                    style: const TextStyle(color: Colors.black54),
                  ),
                ],
              ),
            );
          }
          return RefreshIndicator(
            onRefresh: () async {
              ref.invalidate(patientSignaturesProvider(patientId));
              await ref.read(patientSignaturesProvider(patientId).future);
            },
            child: ListView.separated(
              padding: const EdgeInsets.fromLTRB(16, 16, 16, 32),
              itemCount: items.length + 1,
              separatorBuilder: (_, _) => const SizedBox(height: 10),
              itemBuilder: (context, idx) {
                if (idx == 0) {
                  return Padding(
                    padding: const EdgeInsets.only(bottom: 8),
                    child: Text(
                      patientName,
                      style: const TextStyle(
                        fontSize: 20,
                        fontWeight: FontWeight.bold,
                      ),
                    ),
                  );
                }
                final sig = items[idx - 1];
                return Container(
                  decoration: BoxDecoration(
                    color: Colors.white,
                    borderRadius: BorderRadius.circular(14),
                    border: Border.all(color: Colors.black12),
                  ),
                  padding: const EdgeInsets.all(14),
                  child: Row(
                    children: [
                      CircleAvatar(
                        radius: 22,
                        backgroundColor: _green.withValues(alpha: 0.12),
                        child: Icon(
                          _iconFor(sig.documentType),
                          color: _green,
                        ),
                      ),
                      const SizedBox(width: 12),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              sig.documentType.label,
                              style: const TextStyle(
                                fontSize: 15,
                                fontWeight: FontWeight.w600,
                              ),
                            ),
                            const SizedBox(height: 2),
                            Text(
                              _formatDate(sig.signedAt),
                              style: const TextStyle(
                                fontSize: 12,
                                color: Colors.black54,
                              ),
                            ),
                            const SizedBox(height: 2),
                            Text(
                              'Unterzeichner: ${sig.signerName}',
                              style: const TextStyle(fontSize: 12),
                            ),
                            if (sig.note != null && sig.note!.isNotEmpty) ...[
                              const SizedBox(height: 2),
                              Text(
                                sig.note!,
                                style: const TextStyle(
                                  fontSize: 11,
                                  color: Colors.black45,
                                  fontStyle: FontStyle.italic,
                                ),
                              ),
                            ],
                          ],
                        ),
                      ),
                    ],
                  ),
                );
              },
            ),
          );
        },
      ),
    );
  }
}
