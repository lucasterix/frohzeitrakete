import 'dart:async';
import 'dart:convert';

import 'package:path/path.dart' as p;
import 'package:path_provider/path_provider.dart';
import 'package:sqflite/sqflite.dart';

/// Persistent queue für Einträge die offline erfasst wurden.
///
/// Jede Zeile ist ein JSON-Blob mit dem Payload den EntryRepository an
/// `/mobile/entries` schicken soll sobald wieder Netz da ist. Bei
/// erfolgreichem Sync wird die Zeile gelöscht, bei Fehler bleibt sie
/// stehen — retry passiert beim nächsten SyncService-Aufruf.
class OfflineQueue {
  static Database? _db;

  static Future<Database> _openDb() async {
    if (_db != null) return _db!;
    final dir = await getApplicationDocumentsDirectory();
    final path = p.join(dir.path, 'frohzeit_offline.db');
    _db = await openDatabase(
      path,
      version: 1,
      onCreate: (db, version) async {
        await db.execute('''
          CREATE TABLE IF NOT EXISTS pending_entries (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            payload TEXT NOT NULL,
            created_at TEXT NOT NULL,
            last_error TEXT,
            retry_count INTEGER NOT NULL DEFAULT 0
          )
        ''');
      },
    );
    return _db!;
  }

  static Future<int> enqueue(Map<String, dynamic> payload) async {
    final db = await _openDb();
    return db.insert('pending_entries', {
      'payload': jsonEncode(payload),
      'created_at': DateTime.now().toIso8601String(),
    });
  }

  static Future<List<PendingEntry>> listAll() async {
    final db = await _openDb();
    final rows = await db.query(
      'pending_entries',
      orderBy: 'created_at ASC',
    );
    return rows.map(PendingEntry.fromRow).toList();
  }

  static Future<int> count() async {
    final db = await _openDb();
    final result = await db.rawQuery(
      'SELECT COUNT(*) as c FROM pending_entries',
    );
    return Sqflite.firstIntValue(result) ?? 0;
  }

  static Future<void> remove(int id) async {
    final db = await _openDb();
    await db.delete('pending_entries', where: 'id = ?', whereArgs: [id]);
  }

  static Future<void> markFailed(int id, String error) async {
    final db = await _openDb();
    await db.rawUpdate(
      'UPDATE pending_entries SET last_error = ?, retry_count = retry_count + 1 WHERE id = ?',
      [error, id],
    );
  }

  static Future<void> clear() async {
    final db = await _openDb();
    await db.delete('pending_entries');
  }
}

class PendingEntry {
  final int id;
  final Map<String, dynamic> payload;
  final DateTime createdAt;
  final String? lastError;
  final int retryCount;

  PendingEntry({
    required this.id,
    required this.payload,
    required this.createdAt,
    this.lastError,
    required this.retryCount,
  });

  factory PendingEntry.fromRow(Map<String, Object?> row) {
    return PendingEntry(
      id: row['id'] as int,
      payload: jsonDecode(row['payload'] as String) as Map<String, dynamic>,
      createdAt: DateTime.parse(row['created_at'] as String),
      lastError: row['last_error'] as String?,
      retryCount: (row['retry_count'] as int?) ?? 0,
    );
  }
}
