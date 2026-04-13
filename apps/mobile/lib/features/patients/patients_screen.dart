import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/api/api_exception.dart';
import '../../core/models/mobile_patient.dart';
import '../../core/providers.dart';
import '../../shared/widgets/notification_bell.dart';
import '../settings/settings_screen.dart';
import 'patient_detail_screen.dart';

class PatientsScreen extends ConsumerStatefulWidget {
  const PatientsScreen({super.key});

  @override
  ConsumerState<PatientsScreen> createState() => _PatientsScreenState();
}

class _PatientsScreenState extends ConsumerState<PatientsScreen> {
  final _searchController = TextEditingController();
  String _query = '';
  bool _globalSearch = false;
  Timer? _debounce;
  List<MobilePatient>? _globalResults;
  bool _globalLoading = false;
  String? _globalError;

  @override
  void dispose() {
    _searchController.dispose();
    _debounce?.cancel();
    super.dispose();
  }

  void _onQueryChanged(String v) {
    setState(() => _query = v);
    if (_globalSearch) {
      _debounce?.cancel();
      if (v.trim().length < 2) {
        setState(() {
          _globalResults = null;
          _globalError = null;
        });
        return;
      }
      _debounce = Timer(const Duration(milliseconds: 400), () {
        _runGlobalSearch(v);
      });
    }
  }

  Future<void> _runGlobalSearch(String query) async {
    setState(() {
      _globalLoading = true;
      _globalError = null;
    });
    try {
      final repo = ref.read(patientRepositoryProvider);
      final results = await repo.searchPatients(query);
      if (!mounted) return;
      setState(() {
        _globalResults = results;
        _globalLoading = false;
      });
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() {
        _globalError = e.message;
        _globalLoading = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _globalError = 'Suche fehlgeschlagen: $e';
        _globalLoading = false;
      });
    }
  }

  List<MobilePatient> _filter(List<MobilePatient> all) {
    if (_query.isEmpty) return all;
    final q = _query.toLowerCase();
    return all.where((p) {
      return p.displayName.toLowerCase().contains(q) ||
          (p.city?.toLowerCase().contains(q) ?? false) ||
          (p.addressLine?.toLowerCase().contains(q) ?? false);
    }).toList();
  }

  Widget _buildGlobalResults() {
    if (_query.trim().length < 2) {
      return const _EmptyState(
        icon: Icons.travel_explore,
        title: 'Vertretungs-Suche',
        subtitle:
            'Tippe mindestens 2 Buchstaben um alle Patienten der Organisation zu durchsuchen.',
      );
    }
    if (_globalLoading) {
      return const Center(child: CircularProgressIndicator());
    }
    if (_globalError != null) {
      return _ErrorState(
        message: _globalError!,
        onRetry: () => _runGlobalSearch(_query),
      );
    }
    final results = _globalResults ?? const <MobilePatient>[];
    if (results.isEmpty) {
      return const _EmptyState(
        icon: Icons.search_off,
        title: 'Keine Treffer',
        subtitle: 'Kein Patient mit diesem Namen gefunden.',
      );
    }
    return ListView.separated(
      itemCount: results.length,
      separatorBuilder: (_, _) => const SizedBox(height: 12),
      itemBuilder: (context, index) => _PatientCard(patient: results[index]),
    );
  }

  @override
  Widget build(BuildContext context) {
    final patientsAsync = ref.watch(patientsProvider);

    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 12, 20, 24),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const Spacer(),
              const NotificationBell(),
              IconButton(
                onPressed: () {
                  Navigator.of(context).push(
                    MaterialPageRoute(
                      builder: (_) => const SettingsScreen(),
                    ),
                  );
                },
                icon: const Icon(Icons.settings_outlined),
              ),
            ],
          ),
          const SizedBox(height: 4),
          Text(
            _globalSearch ? 'Alle Patienten' : 'Meine Patienten',
            style: const TextStyle(fontSize: 32, fontWeight: FontWeight.w600),
          ),
          const SizedBox(height: 18),
          Container(
            decoration: BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.circular(18),
              border: Border.all(color: Colors.black12),
            ),
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 4),
            child: Row(
              children: [
                Icon(
                  _globalSearch ? Icons.travel_explore : Icons.search,
                  color: Colors.black54,
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: TextField(
                    controller: _searchController,
                    onChanged: _onQueryChanged,
                    decoration: InputDecoration(
                      hintText: _globalSearch
                          ? 'Alle Patienten durchsuchen…'
                          : 'Patientensuche',
                      border: InputBorder.none,
                    ),
                  ),
                ),
                if (_query.isNotEmpty)
                  IconButton(
                    onPressed: () {
                      _searchController.clear();
                      setState(() {
                        _query = '';
                        _globalResults = null;
                        _globalError = null;
                      });
                    },
                    icon: const Icon(Icons.close, color: Colors.black54),
                  ),
              ],
            ),
          ),
          const SizedBox(height: 10),

          // Vertretungs-Toggle
          Align(
            alignment: Alignment.centerLeft,
            child: Container(
              decoration: BoxDecoration(
                color: _globalSearch
                    ? const Color(0xFF4F8A5B).withValues(alpha: 0.12)
                    : Colors.white,
                borderRadius: BorderRadius.circular(20),
                border: Border.all(
                  color: _globalSearch
                      ? const Color(0xFF4F8A5B)
                      : Colors.black12,
                ),
              ),
              child: InkWell(
                borderRadius: BorderRadius.circular(20),
                onTap: () {
                  setState(() {
                    _globalSearch = !_globalSearch;
                    _globalResults = null;
                    _globalError = null;
                    if (_query.isNotEmpty && _globalSearch) {
                      _runGlobalSearch(_query);
                    }
                  });
                },
                child: Padding(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 14,
                    vertical: 8,
                  ),
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Icon(
                        _globalSearch
                            ? Icons.groups
                            : Icons.groups_outlined,
                        size: 18,
                        color: _globalSearch
                            ? const Color(0xFF4F8A5B)
                            : Colors.black54,
                      ),
                      const SizedBox(width: 8),
                      Text(
                        _globalSearch
                            ? 'Vertretungs-Modus aktiv'
                            : 'Vertretungs-Modus',
                        style: TextStyle(
                          fontSize: 13,
                          fontWeight: FontWeight.w600,
                          color: _globalSearch
                              ? const Color(0xFF4F8A5B)
                              : Colors.black54,
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ),
          ),

          const SizedBox(height: 12),
          Expanded(
            child: _globalSearch
                ? _buildGlobalResults()
                : patientsAsync.when(
                    loading: () =>
                        const Center(child: CircularProgressIndicator()),
                    error: (error, _) => _ErrorState(
                      message: error.toString(),
                      onRetry: () => ref.invalidate(patientsProvider),
                    ),
                    data: (patients) {
                      final filtered = _filter(patients);

                      if (patients.isEmpty) {
                        return const _EmptyState(
                          icon: Icons.people_outline,
                          title: 'Keine Patienten zugeordnet',
                          subtitle:
                              'Du hast aktuell keine Patienten.\nDas Büro muss dich einem Patienten zuweisen.',
                        );
                      }

                      if (filtered.isEmpty) {
                        return const _EmptyState(
                          icon: Icons.search_off,
                          title: 'Keine Patienten gefunden',
                          subtitle:
                              'Probier einen anderen Suchbegriff oder wechsle in den Vertretungs-Modus.',
                        );
                      }

                      return RefreshIndicator(
                        onRefresh: () async {
                          ref.invalidate(patientsProvider);
                          await ref.read(patientsProvider.future);
                        },
                        child: ListView.separated(
                          itemCount: filtered.length,
                          separatorBuilder: (_, _) =>
                              const SizedBox(height: 12),
                          itemBuilder: (context, index) =>
                              _PatientCard(patient: filtered[index]),
                        ),
                      );
                    },
                  ),
          ),
        ],
      ),
    );
  }
}

class _PatientCard extends StatelessWidget {
  final MobilePatient patient;

  const _PatientCard({required this.patient});

  @override
  Widget build(BuildContext context) {
    const green = Color(0xFF4F8A5B);
    final pflegegrad = patient.pflegegradInt;
    final city = patient.city ?? '';

    return Material(
      color: Colors.white,
      borderRadius: BorderRadius.circular(18),
      child: InkWell(
        borderRadius: BorderRadius.circular(18),
        onTap: () {
          Navigator.of(context).push(
            MaterialPageRoute(
              builder: (_) => PatientDetailScreen(patient: patient),
            ),
          );
        },
        child: Container(
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(18),
            border: Border.all(color: Colors.black12),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  CircleAvatar(
                    radius: 26,
                    backgroundColor: green.withValues(alpha: 0.12),
                    child: Text(
                      patient.initials,
                      style: const TextStyle(
                        color: green,
                        fontWeight: FontWeight.bold,
                        fontSize: 18,
                      ),
                    ),
                  ),
                  const SizedBox(width: 14),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          patient.displayName,
                          style: const TextStyle(
                            fontSize: 19,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                        if (city.isNotEmpty) ...[
                          const SizedBox(height: 2),
                          Row(
                            children: [
                              const Icon(
                                Icons.location_on_outlined,
                                size: 14,
                                color: Colors.black54,
                              ),
                              const SizedBox(width: 4),
                              Flexible(
                                child: Text(
                                  city,
                                  style: const TextStyle(
                                    fontSize: 14,
                                    color: Colors.black54,
                                  ),
                                  overflow: TextOverflow.ellipsis,
                                ),
                              ),
                            ],
                          ),
                        ],
                      ],
                    ),
                  ),
                  const Icon(Icons.chevron_right, color: Colors.black26),
                ],
              ),
              const SizedBox(height: 14),
              Row(
                children: [
                  if (pflegegrad > 0)
                    _chip(label: 'PG $pflegegrad', color: green),
                  if (pflegegrad > 0) const SizedBox(width: 8),
                  if (patient.isPrimary)
                    _chip(
                      label: 'Hauptpatient',
                      color: green,
                      icon: Icons.star,
                    ),
                  if (!patient.active) ...[
                    const SizedBox(width: 8),
                    _chip(
                      label: 'Inaktiv',
                      color: Colors.orange,
                      icon: Icons.pause_circle_outline,
                    ),
                  ],
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _chip({
    required String label,
    required Color color,
    IconData? icon,
    bool filled = false,
  }) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
      decoration: BoxDecoration(
        color: filled ? color : color.withValues(alpha: 0.1),
        borderRadius: BorderRadius.circular(8),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (icon != null) ...[
            Icon(icon, size: 14, color: filled ? Colors.white : color),
            const SizedBox(width: 4),
          ],
          Text(
            label,
            style: TextStyle(
              fontSize: 12,
              fontWeight: FontWeight.w700,
              color: filled ? Colors.white : color,
            ),
          ),
        ],
      ),
    );
  }
}

class _EmptyState extends StatelessWidget {
  final IconData icon;
  final String title;
  final String subtitle;

  const _EmptyState({
    required this.icon,
    required this.title,
    required this.subtitle,
  });

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(icon, size: 48, color: Colors.black26),
            const SizedBox(height: 14),
            Text(
              title,
              style: const TextStyle(fontSize: 17, color: Colors.black54),
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 6),
            Text(
              subtitle,
              style: const TextStyle(fontSize: 14, color: Colors.black45),
              textAlign: TextAlign.center,
            ),
          ],
        ),
      ),
    );
  }
}

class _ErrorState extends StatelessWidget {
  final String message;
  final VoidCallback onRetry;

  const _ErrorState({required this.message, required this.onRetry});

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(
              Icons.cloud_off_outlined,
              size: 52,
              color: Colors.black26,
            ),
            const SizedBox(height: 14),
            const Text(
              'Konnte Patienten nicht laden',
              style: TextStyle(
                fontSize: 17,
                fontWeight: FontWeight.w600,
              ),
            ),
            const SizedBox(height: 6),
            Text(
              message,
              style: const TextStyle(fontSize: 14, color: Colors.black54),
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 16),
            OutlinedButton.icon(
              onPressed: onRetry,
              icon: const Icon(Icons.refresh),
              label: const Text('Erneut versuchen'),
            ),
          ],
        ),
      ),
    );
  }
}
