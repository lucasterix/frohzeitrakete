import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/api/api_exception.dart';
import '../../core/models/entry.dart';
import '../../core/providers.dart';
import 'entry_screen.dart';

class EntryDetailScreen extends ConsumerStatefulWidget {
  final Entry entry;
  final String patientName;
  final bool monthLocked;

  const EntryDetailScreen({
    super.key,
    required this.entry,
    required this.patientName,
    this.monthLocked = false,
  });

  @override
  ConsumerState<EntryDetailScreen> createState() => _EntryDetailScreenState();
}

class _EntryDetailScreenState extends ConsumerState<EntryDetailScreen> {
  bool _isDeleting = false;

  String _formatHours(double h) {
    final full = h.truncate();
    final half = (h - full) >= 0.5;
    return '$full,${half ? '5' : '0'} h';
  }

  String _formatDate(DateTime d) =>
      '${d.day.toString().padLeft(2, '0')}.${d.month.toString().padLeft(2, '0')}.${d.year}';

  Future<void> _confirmDelete() async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (_) => AlertDialog(
        title: const Text('Einsatz löschen?'),
        content: const Text('Dieser Einsatz wird dauerhaft entfernt.'),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(false),
            child: const Text('Abbrechen'),
          ),
          TextButton(
            onPressed: () => Navigator.of(context).pop(true),
            child: const Text(
              'Löschen',
              style: TextStyle(color: Colors.red),
            ),
          ),
        ],
      ),
    );
    if (confirmed != true || !mounted) return;

    setState(() => _isDeleting = true);

    try {
      await ref.read(entryRepositoryProvider).deleteEntry(widget.entry.id);
      ref.invalidate(patientEntriesProvider);
      ref.invalidate(hoursSummaryProvider);
      ref.invalidate(myEntriesProvider);

      if (!mounted) return;
      Navigator.of(context).pop(true);
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Einsatz gelöscht.')),
      );
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() => _isDeleting = false);
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(e.message),
          backgroundColor: Colors.red,
        ),
      );
    } catch (e) {
      if (!mounted) return;
      setState(() => _isDeleting = false);
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text('Unerwarteter Fehler: $e'),
          backgroundColor: Colors.red,
        ),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    const green = Color(0xFF4F8A5B);
    final isLocked = widget.monthLocked;
    final entry = widget.entry;

    return Scaffold(
      appBar: AppBar(
        title: const Text('Einsatz-Detail'),
        actions: [
          if (!isLocked)
            IconButton(
              onPressed: () {
                Navigator.of(context).pushReplacement(
                  MaterialPageRoute(builder: (_) => const EntryScreen()),
                );
              },
              icon: const Icon(Icons.edit_outlined),
              tooltip: 'Bearbeiten',
            ),
        ],
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.fromLTRB(20, 16, 20, 40),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              widget.patientName,
              style: const TextStyle(
                fontSize: 28,
                fontWeight: FontWeight.bold,
              ),
            ),
            const SizedBox(height: 4),
            Text(
              _formatDate(entry.entryDate),
              style: const TextStyle(fontSize: 17, color: Colors.black54),
            ),

            if (isLocked) ...[
              const SizedBox(height: 14),
              Container(
                padding: const EdgeInsets.symmetric(
                  horizontal: 14,
                  vertical: 10,
                ),
                decoration: BoxDecoration(
                  color: green.withValues(alpha: 0.12),
                  borderRadius: BorderRadius.circular(10),
                ),
                child: const Row(
                  children: [
                    Icon(Icons.verified_outlined, color: green, size: 20),
                    SizedBox(width: 10),
                    Expanded(
                      child: Text(
                        'Monat wurde unterschrieben – keine Änderungen mehr möglich',
                        style: TextStyle(fontSize: 14, color: green),
                      ),
                    ),
                  ],
                ),
              ),
            ],

            const SizedBox(height: 28),

            // Stunden
            Container(
              padding: const EdgeInsets.all(20),
              decoration: BoxDecoration(
                color: green.withValues(alpha: 0.08),
                borderRadius: BorderRadius.circular(14),
                border: Border.all(color: green.withValues(alpha: 0.3)),
              ),
              child: Row(
                children: [
                  const Icon(Icons.schedule, color: green, size: 28),
                  const SizedBox(width: 14),
                  const Text(
                    'Dauer',
                    style: TextStyle(
                      fontSize: 17,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                  const Spacer(),
                  Text(
                    _formatHours(entry.hours),
                    style: const TextStyle(
                      fontSize: 24,
                      fontWeight: FontWeight.bold,
                      color: green,
                    ),
                  ),
                ],
              ),
            ),

            const SizedBox(height: 24),

            const Text(
              'Tätigkeiten',
              style: TextStyle(fontSize: 18, fontWeight: FontWeight.w600),
            ),
            const SizedBox(height: 10),
            Container(
              decoration: BoxDecoration(
                color: Colors.white,
                borderRadius: BorderRadius.circular(14),
                border: Border.all(color: Colors.black12),
              ),
              child: Column(
                children: entry.activities.asMap().entries.map((e) {
                  final isLast = e.key == entry.activities.length - 1;
                  return Column(
                    children: [
                      ListTile(
                        leading: const Icon(
                          Icons.check_circle_outline,
                          color: green,
                        ),
                        title: Text(
                          e.value,
                          style: const TextStyle(fontSize: 16),
                        ),
                        dense: true,
                      ),
                      if (!isLast) const Divider(height: 1, indent: 56),
                    ],
                  );
                }).toList(),
              ),
            ),

            if (entry.note != null && entry.note!.isNotEmpty) ...[
              const SizedBox(height: 24),
              const Text(
                'Notiz',
                style: TextStyle(fontSize: 18, fontWeight: FontWeight.w600),
              ),
              const SizedBox(height: 10),
              Container(
                width: double.infinity,
                padding: const EdgeInsets.all(14),
                decoration: BoxDecoration(
                  color: Colors.white,
                  borderRadius: BorderRadius.circular(14),
                  border: Border.all(color: Colors.black12),
                ),
                child: Text(
                  entry.note!,
                  style: const TextStyle(fontSize: 14),
                ),
              ),
            ],

            if (!isLocked) ...[
              const SizedBox(height: 32),
              SizedBox(
                width: double.infinity,
                height: 50,
                child: OutlinedButton.icon(
                  onPressed: _isDeleting ? null : _confirmDelete,
                  icon: _isDeleting
                      ? const SizedBox(
                          width: 18,
                          height: 18,
                          child: CircularProgressIndicator(
                            strokeWidth: 2,
                            color: Colors.red,
                          ),
                        )
                      : const Icon(Icons.delete_outline, color: Colors.red),
                  label: const Text(
                    'Einsatz löschen',
                    style: TextStyle(color: Colors.red, fontSize: 16),
                  ),
                  style: OutlinedButton.styleFrom(
                    side: const BorderSide(color: Colors.red),
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(14),
                    ),
                  ),
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }
}
