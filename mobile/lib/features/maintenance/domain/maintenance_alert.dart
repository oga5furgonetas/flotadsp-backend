/// Aviso de mantenimiento de una furgoneta (`GET /alerts/maintenance`).
class MaintenanceAlert {
  const MaintenanceAlert({
    required this.vehicleId,
    required this.licensePlate,
    required this.brand,
    required this.kind,
    required this.label,
    required this.kmUntilChange,
    required this.overdue,
    required this.warning,
    this.center,
    this.mileage,
    this.nextChangeAtKm,
  });

  final String vehicleId;
  final String licensePlate;
  final String brand;
  final String kind; // oil | ruedas | pastillas
  final String label; // Aceite | Ruedas | Pastillas de freno
  final int kmUntilChange;
  final bool overdue;
  final bool warning;
  final String? center;
  final int? mileage;
  final int? nextChangeAtKm;

  factory MaintenanceAlert.fromJson(Map<String, dynamic> j) => MaintenanceAlert(
        vehicleId: (j['vehicle_id'] ?? '').toString(),
        licensePlate: (j['license_plate'] ?? '') as String,
        brand: (j['brand'] ?? '') as String,
        kind: (j['kind'] ?? '') as String,
        label: (j['label'] ?? '') as String,
        kmUntilChange: (j['km_until_change'] as num?)?.toInt() ?? 0,
        overdue: j['overdue'] == true,
        warning: j['warning'] == true,
        center: j['center'] as String?,
        mileage: j['mileage'] is num ? (j['mileage'] as num).toInt() : null,
        nextChangeAtKm: j['next_change_at_km'] is num ? (j['next_change_at_km'] as num).toInt() : null,
      );
}
