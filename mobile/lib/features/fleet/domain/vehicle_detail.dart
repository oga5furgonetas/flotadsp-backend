/// Info de mantenimiento de un vehículo (`GET /vehicles/{id}/maintenance`).
class MaintenanceInfo {
  const MaintenanceInfo({
    this.mileage,
    this.bagsRemaining = 0,
    this.provider,
    this.kmPerDay,
    this.oil,
    this.tires,
    this.brakes,
  });

  final int? mileage;
  final int bagsRemaining;
  final String? provider;
  final double? kmPerDay; // km/día reales estimados
  final MaintItem? oil;
  final MaintItem? tires;
  final MaintItem? brakes;

  /// Ítems presentes (con datos de último cambio), en orden de vencimiento.
  List<({String label, MaintItem item})> get items {
    final out = <({String label, MaintItem item})>[
      if (oil != null) (label: 'Aceite', item: oil!),
      if (tires != null) (label: 'Ruedas', item: tires!),
      if (brakes != null) (label: 'Pastillas de freno', item: brakes!),
    ]..sort((a, b) => a.item.kmUntilChange.compareTo(b.item.kmUntilChange));
    return out;
  }

  factory MaintenanceInfo.fromJson(Map<String, dynamic> j) => MaintenanceInfo(
        mileage: j['mileage'] is num ? (j['mileage'] as num).toInt() : null,
        bagsRemaining: j['bags_remaining'] is num ? (j['bags_remaining'] as num).toInt() : 0,
        provider: j['provider'] as String?,
        kmPerDay: j['km_per_day'] is num ? (j['km_per_day'] as num).toDouble() : null,
        oil: MaintItem.tryFrom(j['oil']),
        tires: MaintItem.tryFrom(j['ruedas']),
        brakes: MaintItem.tryFrom(j['pastillas']),
      );
}

/// Estado de un ítem de mantenimiento (aceite, ruedas, pastillas).
class MaintItem {
  const MaintItem({
    required this.lastChangeKm,
    this.lastChangeDate,
    required this.intervalKm,
    required this.warningBeforeKm,
    required this.kmUntilChange,
    required this.nextChangeAtKm,
    required this.overdue,
    required this.warning,
    this.daysLeftEstimate,
  });

  final int lastChangeKm;
  final String? lastChangeDate;
  final int intervalKm;
  final int warningBeforeKm;
  final int kmUntilChange;
  final int nextChangeAtKm;
  final bool overdue;
  final bool warning;
  final int? daysLeftEstimate;

  /// Fracción recorrida del intervalo (0..1) para la barra de progreso.
  double get progress {
    if (intervalKm <= 0) return 0;
    final done = (intervalKm - kmUntilChange) / intervalKm;
    return done.clamp(0.0, 1.0);
  }

  static MaintItem? tryFrom(Object? v) {
    if (v is! Map) return null;
    final j = Map<String, dynamic>.from(v);
    return MaintItem(
      lastChangeKm: (j['last_change_km'] as num?)?.toInt() ?? 0,
      lastChangeDate: j['last_change_date'] as String?,
      intervalKm: (j['interval_km'] as num?)?.toInt() ?? 0,
      warningBeforeKm: (j['warning_before_km'] as num?)?.toInt() ?? 0,
      kmUntilChange: (j['km_until_change'] as num?)?.toInt() ?? 0,
      nextChangeAtKm: (j['next_change_at_km'] as num?)?.toInt() ?? 0,
      overdue: j['overdue'] == true,
      warning: j['warning'] == true,
      daysLeftEstimate:
          j['days_left_estimate'] is num ? (j['days_left_estimate'] as num).toInt() : null,
    );
  }
}

/// Documento de un vehículo (`GET /vehicles/{id}/documents`).
class VehicleDocument {
  const VehicleDocument({
    required this.id,
    required this.docType,
    required this.name,
    required this.url,
    this.uploadedAt,
  });

  final String id;
  final String docType;
  final String name;
  final String url;
  final String? uploadedAt;

  factory VehicleDocument.fromJson(Map<String, dynamic> j) => VehicleDocument(
        id: (j['id'] ?? '').toString(),
        docType: (j['doc_type'] ?? '') as String,
        name: (j['name'] ?? 'Documento') as String,
        url: (j['url'] ?? '') as String,
        uploadedAt: j['uploaded_at'] as String?,
      );
}

/// Conductor asignado actualmente a un vehículo (`GET /vehicles/{id}/driver`).
class AssignedDriver {
  const AssignedDriver({
    required this.name,
    this.phone,
    this.dni,
    this.center,
    this.photoUrl,
    this.licenseNumber,
  });

  final String name;
  final String? phone;
  final String? dni;
  final String? center;
  final String? photoUrl;
  final String? licenseNumber;

  factory AssignedDriver.fromJson(Map<String, dynamic> j) => AssignedDriver(
        name: (j['name'] ?? 'Conductor') as String,
        phone: j['phone'] as String?,
        dni: j['dni'] as String?,
        center: j['center'] as String?,
        photoUrl: j['photo_url'] as String?,
        licenseNumber: j['license_number'] as String?,
      );
}
