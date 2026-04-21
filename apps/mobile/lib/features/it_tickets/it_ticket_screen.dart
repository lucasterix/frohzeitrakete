import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:package_info_plus/package_info_plus.dart';
import 'dart:io' show Platform;

import '../../core/providers.dart';

class ItTicketScreen extends ConsumerStatefulWidget {
  const ItTicketScreen({super.key});

  @override
  ConsumerState<ItTicketScreen> createState() => _ItTicketScreenState();
}

class _ItTicketScreenState extends ConsumerState<ItTicketScreen> {
  final _titleController = TextEditingController();
  final _descriptionController = TextEditingController();
  String _category = 'bug';
  bool _submitting = false;
  bool _submitted = false;
  List<Map<String, dynamic>> _tickets = [];
  bool _loadingTickets = true;

  static const _categories = <String, String>{
    'bug': 'Fehler / Bug',
    'feature': 'Feature-Wunsch',
    'frage': 'Frage',
    'sonstiges': 'Sonstiges',
  };

  @override
  void initState() {
    super.initState();
    _loadTickets();
  }

  @override
  void dispose() {
    _titleController.dispose();
    _descriptionController.dispose();
    super.dispose();
  }

  Future<void> _loadTickets() async {
    try {
      final client = ref.read(apiClientProvider);
      await client.ready();
      final response = await client.dio.get('/mobile/it-tickets');
      if (response.statusCode == 200) {
        setState(() {
          _tickets = (response.data as List)
              .map((e) => (e as Map).cast<String, dynamic>())
              .toList();
        });
      }
    } catch (_) {}
    setState(() => _loadingTickets = false);
  }

  Future<String> _buildDeviceInfo() async {
    try {
      final info = await PackageInfo.fromPlatform();
      final os =
          '${Platform.operatingSystem} ${Platform.operatingSystemVersion}';
      return 'App ${info.version}+${info.buildNumber} | $os';
    } catch (_) {
      return 'Unbekannt';
    }
  }

  Future<void> _submit() async {
    final title = _titleController.text.trim();
    final description = _descriptionController.text.trim();
    if (title.isEmpty || description.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Bitte Titel und Beschreibung angeben')),
      );
      return;
    }

    setState(() => _submitting = true);
    try {
      final client = ref.read(apiClientProvider);
      await client.ready();
      final deviceInfo = await _buildDeviceInfo();
      final response = await client.dio.post('/mobile/it-tickets', data: {
        'title': title,
        'description': description,
        'category': _category,
        'device_info': deviceInfo,
      });
      if (response.statusCode == 201 || response.statusCode == 200) {
        setState(() => _submitted = true);
        _titleController.clear();
        _descriptionController.clear();
        _loadTickets();
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(
              content: Text('Ticket erstellt. Danke fuer deine Meldung!'),
              backgroundColor: Colors.green,
            ),
          );
        }
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Fehler: $e'), backgroundColor: Colors.red),
        );
      }
    }
    setState(() => _submitting = false);
  }

  Color _statusColor(String status) {
    switch (status) {
      case 'open':
        return Colors.orange;
      case 'in_progress':
        return Colors.blue;
      case 'done':
        return Colors.green;
      case 'rejected':
        return Colors.red;
      default:
        return Colors.grey;
    }
  }

  String _statusLabel(String status) {
    switch (status) {
      case 'open':
        return 'Offen';
      case 'in_progress':
        return 'In Bearbeitung';
      case 'done':
        return 'Erledigt';
      case 'rejected':
        return 'Abgelehnt';
      default:
        return status;
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Problem melden'),
        backgroundColor: Colors.white,
        foregroundColor: Colors.black87,
        elevation: 0,
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(20),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Form
            Container(
              padding: const EdgeInsets.all(18),
              decoration: BoxDecoration(
                color: Colors.white,
                borderRadius: BorderRadius.circular(18),
                border: Border.all(color: Colors.black12),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text(
                    'Neues Ticket',
                    style: TextStyle(
                      fontSize: 18,
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                  const SizedBox(height: 16),
                  TextField(
                    controller: _titleController,
                    decoration: InputDecoration(
                      labelText: 'Titel',
                      hintText: 'Kurze Beschreibung des Problems',
                      border: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(12),
                      ),
                    ),
                  ),
                  const SizedBox(height: 14),
                  TextField(
                    controller: _descriptionController,
                    maxLines: 4,
                    decoration: InputDecoration(
                      labelText: 'Beschreibung',
                      hintText: 'Was ist passiert? Wann tritt der Fehler auf?',
                      border: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(12),
                      ),
                    ),
                  ),
                  const SizedBox(height: 14),
                  DropdownButtonFormField<String>(
                    value: _category,
                    decoration: InputDecoration(
                      labelText: 'Kategorie',
                      border: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(12),
                      ),
                    ),
                    items: _categories.entries.map((e) {
                      return DropdownMenuItem(
                        value: e.key,
                        child: Text(e.value),
                      );
                    }).toList(),
                    onChanged: (v) {
                      if (v != null) setState(() => _category = v);
                    },
                  ),
                  const SizedBox(height: 16),
                  SizedBox(
                    width: double.infinity,
                    height: 50,
                    child: ElevatedButton(
                      onPressed: _submitting ? null : _submit,
                      style: ElevatedButton.styleFrom(
                        backgroundColor: const Color(0xFF4F8A5B),
                        foregroundColor: Colors.white,
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(14),
                        ),
                      ),
                      child: _submitting
                          ? const SizedBox(
                              width: 22,
                              height: 22,
                              child: CircularProgressIndicator(
                                color: Colors.white,
                                strokeWidth: 2.5,
                              ),
                            )
                          : const Text(
                              'Ticket absenden',
                              style: TextStyle(fontSize: 16),
                            ),
                    ),
                  ),
                ],
              ),
            ),

            const SizedBox(height: 28),

            // My tickets
            const Text(
              'Meine Tickets',
              style: TextStyle(
                fontSize: 18,
                fontWeight: FontWeight.bold,
              ),
            ),
            const SizedBox(height: 12),

            if (_loadingTickets)
              const Center(child: CircularProgressIndicator())
            else if (_tickets.isEmpty)
              Container(
                width: double.infinity,
                padding: const EdgeInsets.all(20),
                decoration: BoxDecoration(
                  color: Colors.white,
                  borderRadius: BorderRadius.circular(14),
                  border: Border.all(color: Colors.black12),
                ),
                child: const Text(
                  'Noch keine Tickets.',
                  style: TextStyle(color: Colors.black54),
                  textAlign: TextAlign.center,
                ),
              )
            else
              ..._tickets.map((t) {
                final status = t['status'] as String? ?? 'open';
                final cat = t['category'] as String? ?? '';
                return Container(
                  margin: const EdgeInsets.only(bottom: 10),
                  padding: const EdgeInsets.all(14),
                  decoration: BoxDecoration(
                    color: Colors.white,
                    borderRadius: BorderRadius.circular(14),
                    border: Border.all(color: Colors.black12),
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          Container(
                            padding: const EdgeInsets.symmetric(
                                horizontal: 8, vertical: 2),
                            decoration: BoxDecoration(
                              color: _statusColor(status).withValues(alpha: 0.15),
                              borderRadius: BorderRadius.circular(8),
                            ),
                            child: Text(
                              _statusLabel(status),
                              style: TextStyle(
                                fontSize: 11,
                                fontWeight: FontWeight.w600,
                                color: _statusColor(status),
                              ),
                            ),
                          ),
                          const SizedBox(width: 8),
                          Container(
                            padding: const EdgeInsets.symmetric(
                                horizontal: 8, vertical: 2),
                            decoration: BoxDecoration(
                              color: Colors.grey.withValues(alpha: 0.12),
                              borderRadius: BorderRadius.circular(8),
                            ),
                            child: Text(
                              _categories[cat] ?? cat,
                              style: const TextStyle(
                                  fontSize: 11, color: Colors.black54),
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 8),
                      Text(
                        t['title'] as String? ?? '',
                        style: const TextStyle(
                          fontSize: 15,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                      if ((t['response_text'] as String?)?.isNotEmpty ??
                          false) ...[
                        const SizedBox(height: 8),
                        Container(
                          width: double.infinity,
                          padding: const EdgeInsets.all(10),
                          decoration: BoxDecoration(
                            color: Colors.blue.withValues(alpha: 0.06),
                            borderRadius: BorderRadius.circular(10),
                          ),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              const Text(
                                'Antwort:',
                                style: TextStyle(
                                  fontSize: 12,
                                  fontWeight: FontWeight.w600,
                                  color: Colors.blue,
                                ),
                              ),
                              const SizedBox(height: 4),
                              Text(
                                t['response_text'] as String,
                                style: const TextStyle(fontSize: 13),
                              ),
                            ],
                          ),
                        ),
                      ],
                      const SizedBox(height: 4),
                      Text(
                        t['created_at'] as String? ?? '',
                        style: const TextStyle(
                            fontSize: 11, color: Colors.black38),
                      ),
                    ],
                  ),
                );
              }),
          ],
        ),
      ),
    );
  }
}
