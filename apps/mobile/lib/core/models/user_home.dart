class UserHome {
  final String addressLine;
  final double? latitude;
  final double? longitude;
  final String source;

  const UserHome({
    required this.addressLine,
    this.latitude,
    this.longitude,
    required this.source,
  });

  factory UserHome.fromJson(Map<String, dynamic> json) {
    return UserHome(
      addressLine: json['address_line'] as String,
      latitude: (json['latitude'] as num?)?.toDouble(),
      longitude: (json['longitude'] as num?)?.toDouble(),
      source: json['source'] as String,
    );
  }
}

/// Trip-Info die beim Entry-Erstellen mitgeschickt wird.
class TripInput {
  final bool startFromHome;
  final String? startAddress;
  final List<String> intermediateStops;

  const TripInput({
    required this.startFromHome,
    this.startAddress,
    this.intermediateStops = const [],
  });

  Map<String, dynamic> toJson() => {
        'start_from_home': startFromHome,
        if (startAddress != null && startAddress!.isNotEmpty)
          'start_address': startAddress,
        'intermediate_stops': intermediateStops,
      };

  bool get isEmpty =>
      !startFromHome &&
      (startAddress == null || startAddress!.isEmpty) &&
      intermediateStops.isEmpty;
}
