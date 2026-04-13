import 'package:flutter/material.dart';
import 'entry_screen.dart';

class EntryDetailScreen extends StatelessWidget {
  final String patientName;
  final String date;
  final double hours;
  final List<String> activities;
  final bool isSigned;

  const EntryDetailScreen({
    super.key,
    required this.patientName,
    required this.date,
    required this.hours,
    required this.activities,
    this.isSigned = false,
  });

  String _formatHours(double h) {
    final full = h.truncate();
    final half = (h - full) >= 0.5;
    return '$full,${half ? '5' : '0'} h';
  }

  @override
  Widget build(BuildContext context) {
    const green = Color(0xFF4F8A5B);

    return Scaffold(
      appBar: AppBar(
        title: const Text('Einsatz-Detail'),
        actions: [
          if (!isSigned)
            IconButton(
              onPressed: () {
                Navigator.of(context).pushReplacement(
                  MaterialPageRoute(
                    builder: (_) => const EntryScreen(),
                  ),
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
              patientName,
              style: const TextStyle(
                fontSize: 28,
                fontWeight: FontWeight.bold,
              ),
            ),
            const SizedBox(height: 4),
            Text(
              date,
              style: const TextStyle(fontSize: 17, color: Colors.black54),
            ),

            if (isSigned) ...[
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
                    Text(
                      'Vom Patienten unterschrieben',
                      style: TextStyle(fontSize: 14, color: green),
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
                    _formatHours(hours),
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
              style: TextStyle(
                fontSize: 18,
                fontWeight: FontWeight.w600,
              ),
            ),
            const SizedBox(height: 10),
            Container(
              decoration: BoxDecoration(
                color: Colors.white,
                borderRadius: BorderRadius.circular(14),
                border: Border.all(color: Colors.black12),
              ),
              child: Column(
                children: activities.asMap().entries.map((e) {
                  final isLast = e.key == activities.length - 1;
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

            if (!isSigned) ...[
              const SizedBox(height: 32),
              SizedBox(
                width: double.infinity,
                height: 50,
                child: OutlinedButton.icon(
                  onPressed: () => _confirmDelete(context),
                  icon: const Icon(Icons.delete_outline, color: Colors.red),
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

  Future<void> _confirmDelete(BuildContext context) async {
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
    if (confirmed == true && context.mounted) {
      Navigator.of(context).pop();
    }
  }
}
