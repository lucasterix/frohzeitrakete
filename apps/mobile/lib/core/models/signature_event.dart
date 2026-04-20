enum DocumentType {
  leistungsnachweis,
  vpAntrag,
  pflegeumwandlung,
  betreuungsvertrag,
  pflegeantragHilfsmittel;

  String get apiValue {
    switch (this) {
      case DocumentType.leistungsnachweis:
        return 'leistungsnachweis';
      case DocumentType.vpAntrag:
        return 'vp_antrag';
      case DocumentType.pflegeumwandlung:
        return 'pflegeumwandlung';
      case DocumentType.betreuungsvertrag:
        return 'betreuungsvertrag';
      case DocumentType.pflegeantragHilfsmittel:
        return 'pflegeantrag_hilfsmittel';
    }
  }

  String get label {
    switch (this) {
      case DocumentType.leistungsnachweis:
        return 'Leistungsnachweis';
      case DocumentType.vpAntrag:
        return 'Verhinderungspflege';
      case DocumentType.pflegeumwandlung:
        return 'Pflegeumwandlung';
      case DocumentType.betreuungsvertrag:
        return 'Betreuungsvertrag';
      case DocumentType.pflegeantragHilfsmittel:
        return 'Pflegehilfsmittel';
    }
  }

  static DocumentType fromApiValue(String value) {
    switch (value) {
      case 'leistungsnachweis':
        return DocumentType.leistungsnachweis;
      case 'vp_antrag':
        return DocumentType.vpAntrag;
      case 'pflegeumwandlung':
        return DocumentType.pflegeumwandlung;
      case 'betreuungsvertrag':
        return DocumentType.betreuungsvertrag;
      case 'pflegeantrag_hilfsmittel':
        return DocumentType.pflegeantragHilfsmittel;
      default:
        throw ArgumentError('Unknown document type: $value');
    }
  }
}

class SignatureEvent {
  final int id;
  final int patientId;
  final DocumentType documentType;
  final String status;
  final String signerName;
  final String source;
  final String? note;
  final int? createdByUserId;
  final DateTime signedAt;
  final bool approvedByKk;
  final DateTime? approvedAt;
  final String? approvedNote;
  final DateTime createdAt;

  const SignatureEvent({
    required this.id,
    required this.patientId,
    required this.documentType,
    required this.status,
    required this.signerName,
    required this.source,
    this.note,
    this.createdByUserId,
    required this.signedAt,
    this.approvedByKk = false,
    this.approvedAt,
    this.approvedNote,
    required this.createdAt,
  });

  factory SignatureEvent.fromJson(Map<String, dynamic> json) {
    return SignatureEvent(
      id: json['id'] as int,
      patientId: json['patient_id'] as int,
      documentType: DocumentType.fromApiValue(json['document_type'] as String),
      status: json['status'] as String,
      signerName: json['signer_name'] as String,
      source: json['source'] as String,
      note: json['note'] as String?,
      createdByUserId: json['created_by_user_id'] as int?,
      signedAt: DateTime.parse(json['signed_at'] as String),
      approvedByKk: (json['approved_by_kk'] as bool?) ?? false,
      approvedAt: json['approved_at'] != null
          ? DateTime.parse(json['approved_at'] as String)
          : null,
      approvedNote: json['approved_note'] as String?,
      createdAt: DateTime.parse(json['created_at'] as String),
    );
  }
}
