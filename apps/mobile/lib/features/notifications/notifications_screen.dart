import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/models/notification.dart';
import '../../core/providers.dart';

class NotificationsScreen extends ConsumerWidget {
  const NotificationsScreen({super.key});

  IconData _iconFor(String kind) {
    switch (kind) {
      case 'call_request_created':
        return Icons.phone_callback_outlined;
      case 'training_new':
        return Icons.school_outlined;
      case 'birthday_reminder':
        return Icons.cake_outlined;
      case 'office_message':
        return Icons.campaign_outlined;
      default:
        return Icons.notifications_none;
    }
  }

  String _formatTime(DateTime dt) {
    final local = dt.toLocal();
    final now = DateTime.now();
    final today =
        local.year == now.year && local.month == now.month && local.day == now.day;
    final hh = local.hour.toString().padLeft(2, '0');
    final mm = local.minute.toString().padLeft(2, '0');
    if (today) return 'Heute, $hh:$mm';
    return '${local.day.toString().padLeft(2, '0')}.${local.month.toString().padLeft(2, '0')}.${local.year}';
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    const green = Color(0xFF4F8A5B);
    final asyncNotifs = ref.watch(notificationsProvider);

    return Scaffold(
      appBar: AppBar(
        title: const Text('Benachrichtigungen'),
        actions: [
          TextButton(
            onPressed: () async {
              await ref.read(notificationRepositoryProvider).markAllRead();
              ref.invalidate(notificationsProvider);
              ref.invalidate(unreadNotificationCountProvider);
            },
            child: const Text('Alle gelesen'),
          ),
        ],
      ),
      body: asyncNotifs.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(
          child: Padding(
            padding: const EdgeInsets.all(24),
            child: Text(
              'Konnte Benachrichtigungen nicht laden:\n$e',
              textAlign: TextAlign.center,
              style: const TextStyle(color: Colors.black54),
            ),
          ),
        ),
        data: (items) {
          if (items.isEmpty) {
            return const Center(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Icon(
                    Icons.notifications_off_outlined,
                    size: 64,
                    color: Colors.black26,
                  ),
                  SizedBox(height: 16),
                  Text(
                    'Keine Benachrichtigungen',
                    style: TextStyle(fontSize: 16, color: Colors.black54),
                  ),
                ],
              ),
            );
          }

          return RefreshIndicator(
            onRefresh: () async {
              ref.invalidate(notificationsProvider);
              ref.invalidate(unreadNotificationCountProvider);
              await ref.read(notificationsProvider.future);
            },
            child: ListView.separated(
              padding: const EdgeInsets.fromLTRB(16, 16, 16, 32),
              itemCount: items.length,
              separatorBuilder: (_, _) => const SizedBox(height: 10),
              itemBuilder: (context, index) {
                final AppNotification n = items[index];
                final unread = n.isUnread;
                return Container(
                  decoration: BoxDecoration(
                    color: Colors.white,
                    borderRadius: BorderRadius.circular(14),
                    border: Border.all(
                      color: unread
                          ? green.withValues(alpha: 0.4)
                          : Colors.black12,
                      width: unread ? 1.3 : 1,
                    ),
                  ),
                  child: ListTile(
                    contentPadding: const EdgeInsets.symmetric(
                      horizontal: 16,
                      vertical: 8,
                    ),
                    leading: CircleAvatar(
                      backgroundColor: green.withValues(alpha: 0.12),
                      child: Icon(_iconFor(n.kind), color: green),
                    ),
                    title: Row(
                      children: [
                        Expanded(
                          child: Text(
                            n.title,
                            style: TextStyle(
                              fontSize: 16,
                              fontWeight: unread
                                  ? FontWeight.bold
                                  : FontWeight.w500,
                            ),
                          ),
                        ),
                        if (unread)
                          Container(
                            width: 9,
                            height: 9,
                            decoration: const BoxDecoration(
                              color: green,
                              shape: BoxShape.circle,
                            ),
                          ),
                      ],
                    ),
                    subtitle: Padding(
                      padding: const EdgeInsets.only(top: 6),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          if (n.body != null)
                            Text(
                              n.body!,
                              style: const TextStyle(fontSize: 14),
                            ),
                          const SizedBox(height: 6),
                          Text(
                            _formatTime(n.createdAt),
                            style: const TextStyle(
                              fontSize: 12,
                              color: Colors.black45,
                            ),
                          ),
                        ],
                      ),
                    ),
                    onTap: () async {
                      if (unread) {
                        await ref
                            .read(notificationRepositoryProvider)
                            .markRead(n.id);
                        ref.invalidate(notificationsProvider);
                        ref.invalidate(unreadNotificationCountProvider);
                      }
                    },
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
