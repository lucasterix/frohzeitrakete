import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/models/entry.dart';
import '../../core/providers.dart';

/// Reusable text field with live address autocomplete against the Backend-
/// proxy to OpenRouteService.
///
/// Usage:
///   AddressAutocomplete(
///     label: 'Adresse',
///     initialValue: _myCtrl.text,
///     onAddressSelected: (label) => _myCtrl.text = label,
///   )
///
/// The widget itself manages its own TextEditingController. The onSelected
/// callback fires when the user picks a suggestion OR accepts a validated
/// address. The caller must store the chosen label for later use.
class AddressAutocomplete extends ConsumerStatefulWidget {
  final String label;
  final String? hint;
  final String initialValue;
  final void Function(String label) onAddressSelected;
  final VoidCallback? onCleared;

  const AddressAutocomplete({
    super.key,
    required this.label,
    this.hint,
    this.initialValue = '',
    required this.onAddressSelected,
    this.onCleared,
  });

  @override
  ConsumerState<AddressAutocomplete> createState() =>
      _AddressAutocompleteState();
}

class _AddressAutocompleteState extends ConsumerState<AddressAutocomplete> {
  late final TextEditingController _ctrl;
  Timer? _debounce;
  List<AddressSuggestion> _suggestions = const [];
  bool _loading = false;
  bool _confirmed = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _ctrl = TextEditingController(text: widget.initialValue);
    _confirmed = widget.initialValue.isNotEmpty;
  }

  @override
  void dispose() {
    _debounce?.cancel();
    _ctrl.dispose();
    super.dispose();
  }

  void _onChanged(String value) {
    setState(() {
      _confirmed = false;
      _error = null;
    });
    _debounce?.cancel();
    if (value.trim().length < 3) {
      setState(() => _suggestions = const []);
      return;
    }
    _debounce = Timer(const Duration(milliseconds: 350), () {
      _fetchSuggestions(value);
    });
  }

  Future<void> _fetchSuggestions(String value) async {
    setState(() => _loading = true);
    try {
      final repo = ref.read(entryRepositoryProvider);
      final results = await repo.autocompleteAddress(value);
      if (!mounted) return;
      setState(() {
        _suggestions = results;
        _loading = false;
        _error = results.isEmpty ? 'Keine Treffer' : null;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _loading = false;
        _error = 'Suche fehlgeschlagen';
      });
    }
  }

  void _pick(AddressSuggestion s) {
    _ctrl.text = s.label;
    _ctrl.selection = TextSelection.collapsed(offset: s.label.length);
    setState(() {
      _suggestions = const [];
      _confirmed = true;
      _error = null;
    });
    widget.onAddressSelected(s.label);
  }

  @override
  Widget build(BuildContext context) {
    const green = Color(0xFF4F8A5B);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        TextField(
          controller: _ctrl,
          onChanged: _onChanged,
          decoration: InputDecoration(
            labelText: widget.label,
            hintText: widget.hint,
            isDense: true,
            suffixIcon: _loading
                ? const SizedBox(
                    width: 20,
                    height: 20,
                    child: Padding(
                      padding: EdgeInsets.all(10),
                      child: CircularProgressIndicator(strokeWidth: 2),
                    ),
                  )
                : _confirmed
                    ? const Icon(
                        Icons.check_circle,
                        color: green,
                        size: 20,
                      )
                    : (_ctrl.text.isNotEmpty
                        ? IconButton(
                            icon: const Icon(Icons.close, size: 16),
                            onPressed: () {
                              _ctrl.clear();
                              setState(() {
                                _suggestions = const [];
                                _confirmed = false;
                              });
                              widget.onCleared?.call();
                            },
                          )
                        : null),
          ),
        ),
        if (!_confirmed && _ctrl.text.trim().length >= 3 && !_loading)
          Container(
            margin: const EdgeInsets.only(top: 6),
            decoration: BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.circular(10),
              border: Border.all(color: Colors.black12),
            ),
            child: Column(
              children: [
                if (_error != null && _suggestions.isEmpty)
                  Padding(
                    padding: const EdgeInsets.all(12),
                    child: Text(
                      _error!,
                      style: const TextStyle(
                        fontSize: 12,
                        color: Colors.orange,
                      ),
                    ),
                  ),
                ..._suggestions.asMap().entries.map((e) {
                  final isLast = e.key == _suggestions.length - 1;
                  return Column(
                    children: [
                      ListTile(
                        dense: true,
                        leading: const Icon(
                          Icons.location_on_outlined,
                          size: 18,
                          color: green,
                        ),
                        title: Text(
                          e.value.label,
                          style: const TextStyle(fontSize: 13),
                        ),
                        onTap: () => _pick(e.value),
                      ),
                      if (!isLast)
                        const Divider(height: 1, indent: 40),
                    ],
                  );
                }),
              ],
            ),
          ),
        if (_confirmed && _ctrl.text.isNotEmpty)
          Padding(
            padding: const EdgeInsets.only(top: 4, left: 4),
            child: Text(
              '✓ Adresse bestätigt',
              style: TextStyle(
                fontSize: 11,
                color: green.withValues(alpha: 0.8),
              ),
            ),
          ),
      ],
    );
  }
}
