import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/api/api_exception.dart';
import '../../core/providers.dart';
import '../../shared/widgets/address_autocomplete.dart';

class PatientIntakeScreen extends ConsumerStatefulWidget {
  const PatientIntakeScreen({super.key});

  @override
  ConsumerState<PatientIntakeScreen> createState() =>
      _PatientIntakeScreenState();
}

class _PatientIntakeScreenState extends ConsumerState<PatientIntakeScreen> {
  final _formKey = GlobalKey<FormState>();
  final _nameCtrl = TextEditingController();
  final _birthdateCtrl = TextEditingController();
  final _phoneCtrl = TextEditingController();
  final _contactCtrl = TextEditingController();
  final _noteCtrl = TextEditingController();

  String _address = '';
  String _careLevel = '';
  bool _submitting = false;
  String? _error;

  @override
  void dispose() {
    _nameCtrl.dispose();
    _birthdateCtrl.dispose();
    _phoneCtrl.dispose();
    _contactCtrl.dispose();
    _noteCtrl.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (!(_formKey.currentState?.validate() ?? false)) return;
    setState(() {
      _submitting = true;
      _error = null;
    });
    try {
      final repo = ref.read(patientIntakeRepositoryProvider);
      await repo.create(
        fullName: _nameCtrl.text.trim(),
        birthdate: _birthdateCtrl.text.trim().isEmpty
            ? null
            : _birthdateCtrl.text.trim(),
        address: _address.isEmpty ? null : _address,
        phone: _phoneCtrl.text.trim(),
        contactPerson: _contactCtrl.text.trim().isEmpty
            ? null
            : _contactCtrl.text.trim(),
        careLevel: _careLevel.isEmpty ? null : _careLevel,
        note: _noteCtrl.text.trim().isEmpty ? null : _noteCtrl.text.trim(),
      );
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text(
            'Neuaufnahme an Büro gesendet. Du bekommst Bescheid sobald der Patient in Patti angelegt ist.',
          ),
          backgroundColor: Color(0xFF4F8A5B),
        ),
      );
      Navigator.of(context).pop();
    } on ApiException catch (e) {
      setState(() => _error = e.message);
    } catch (e) {
      setState(() => _error = 'Unbekannter Fehler: $e');
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    const green = Color(0xFF4F8A5B);

    return Scaffold(
      appBar: AppBar(title: const Text('Patient neu aufnehmen')),
      body: SafeArea(
        child: Form(
          key: _formKey,
          child: ListView(
            padding: const EdgeInsets.all(16),
            children: [
              const Text(
                'Diese Daten landen sofort beim Büro. Sobald der Patient in Patti angelegt ist, siehst du ihn in deiner Patientenliste.',
                style: TextStyle(color: Colors.black54, height: 1.4),
              ),
              const SizedBox(height: 16),
              TextFormField(
                controller: _nameCtrl,
                decoration: const InputDecoration(
                  labelText: 'Vor- und Nachname *',
                  isDense: true,
                ),
                validator: (v) =>
                    (v == null || v.trim().length < 2) ? 'Pflichtfeld' : null,
              ),
              const SizedBox(height: 12),
              TextFormField(
                controller: _birthdateCtrl,
                decoration: const InputDecoration(
                  labelText: 'Geburtsdatum (z.B. 12.03.1942)',
                  isDense: true,
                ),
              ),
              const SizedBox(height: 12),
              AddressAutocomplete(
                label: 'Adresse',
                hint: 'Straße, PLZ, Ort',
                onAddressSelected: (label) => _address = label,
                onCleared: () => _address = '',
              ),
              const SizedBox(height: 12),
              TextFormField(
                controller: _phoneCtrl,
                decoration: const InputDecoration(
                  labelText: 'Telefon *',
                  isDense: true,
                ),
                keyboardType: TextInputType.phone,
                validator: (v) =>
                    (v == null || v.trim().length < 3) ? 'Pflichtfeld' : null,
              ),
              const SizedBox(height: 12),
              TextFormField(
                controller: _contactCtrl,
                decoration: const InputDecoration(
                  labelText: 'Angehöriger / Kontaktperson',
                  isDense: true,
                ),
              ),
              const SizedBox(height: 12),
              DropdownButtonFormField<String>(
                initialValue: _careLevel.isEmpty ? null : _careLevel,
                decoration: const InputDecoration(
                  labelText: 'Pflegegrad (falls bekannt)',
                  isDense: true,
                ),
                items: const [
                  DropdownMenuItem(value: '', child: Text('–')),
                  DropdownMenuItem(value: '1', child: Text('Pflegegrad 1')),
                  DropdownMenuItem(value: '2', child: Text('Pflegegrad 2')),
                  DropdownMenuItem(value: '3', child: Text('Pflegegrad 3')),
                  DropdownMenuItem(value: '4', child: Text('Pflegegrad 4')),
                  DropdownMenuItem(value: '5', child: Text('Pflegegrad 5')),
                ],
                onChanged: (v) => setState(() => _careLevel = v ?? ''),
              ),
              const SizedBox(height: 12),
              TextFormField(
                controller: _noteCtrl,
                decoration: const InputDecoration(
                  labelText: 'Notiz ans Büro',
                  isDense: true,
                ),
                minLines: 2,
                maxLines: 4,
              ),
              if (_error != null) ...[
                const SizedBox(height: 12),
                Container(
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(
                    color: Colors.red.withValues(alpha: 0.08),
                    borderRadius: BorderRadius.circular(10),
                    border: Border.all(color: Colors.red.withValues(alpha: 0.3)),
                  ),
                  child: Text(
                    _error!,
                    style: const TextStyle(color: Colors.red),
                  ),
                ),
              ],
              const SizedBox(height: 20),
              SizedBox(
                width: double.infinity,
                child: FilledButton.icon(
                  style: FilledButton.styleFrom(
                    backgroundColor: green,
                    padding: const EdgeInsets.symmetric(vertical: 14),
                  ),
                  onPressed: _submitting ? null : _submit,
                  icon: _submitting
                      ? const SizedBox(
                          width: 18,
                          height: 18,
                          child: CircularProgressIndicator(
                            strokeWidth: 2,
                            color: Colors.white,
                          ),
                        )
                      : const Icon(Icons.send),
                  label: Text(
                    _submitting ? 'Sende …' : 'An Büro senden',
                    style: const TextStyle(fontSize: 16),
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
