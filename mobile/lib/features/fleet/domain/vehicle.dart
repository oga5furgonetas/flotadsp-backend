/// Estado de una fecha de vencimiento (ITV, renting).
enum ExpiryLevel { none, ok, soon, expired }

/// Vehículo de la flota. Refleja el modelo real del backend
/// (`GET /vehicles` y `GET /vehicles/{id}`, `response_model=Vehicle`).
class Vehicle {
  const Vehicle({
    required this.id,
    required this.licensePlate,
    required this.brand,
    required this.model,
    required this.status,
    this.color = '',
    this.year,
    this.vin,
    this.center,
    this.currentDriverId,
    this.mileage,
    this.provider,
    this.vehicleType,
    this.fuelType,
    this.workshopStatus,
    this.workshopReason,
    this.itvDate,
    this.rentingEndDate,
    this.rentingBajaDate,
    this.bagsRemaining,
  });

  final String id;
  final String licensePlate;
  final String brand;
  final String model;
  final String status; // active | taller | baja | deleted
  final String color;
  final int? year;
  final String? vin;
  final String? center;
  final String? currentDriverId;
  final int? mileage;
  final String? provider; // proveedor de renting
  final String? vehicleType; // furgoneta, etc.
  final String? fuelType; // diesel | gasolina | electrico | hibrido
  final String? workshopStatus;
  final String? workshopReason;
  final String? itvDate; // ISO YYYY-MM-DD
  final String? rentingEndDate; // ISO
  final String? rentingBajaDate; // ISO
  final int? bagsRemaining;

  String get title => licensePlate.isNotEmpty ? licensePlate : '$brand $model';
  String get subtitle => [brand, model].where((s) => s.isNotEmpty).join(' ');

  bool get isRenting => (provider != null && provider!.trim().isNotEmpty) || rentingEndDate != null;

  /// Estado de la ITV (caducada / próxima 30 días / al día).
  ExpiryLevel get itvLevel => _levelFor(itvDate);

  /// Estado del contrato de renting.
  ExpiryLevel get rentingLevel => _levelFor(rentingEndDate);

  static ExpiryLevel _levelFor(String? iso, {int soonDays = 30}) {
    if (iso == null || iso.isEmpty) return ExpiryLevel.none;
    final d = DateTime.tryParse(iso);
    if (d == null) return ExpiryLevel.none;
    final days = d.difference(DateTime.now()).inDays;
    if (days < 0) return ExpiryLevel.expired;
    if (days <= soonDays) return ExpiryLevel.soon;
    return ExpiryLevel.ok;
  }

  factory Vehicle.fromJson(Map<String, dynamic> j) => Vehicle(
        id: (j['id'] ?? '').toString(),
        licensePlate: (j['license_plate'] ?? '') as String,
        brand: (j['brand'] ?? '') as String,
        model: (j['model'] ?? '') as String,
        status: (j['status'] ?? 'active') as String,
        color: (j['color'] ?? '') as String,
        year: j['year'] is num ? (j['year'] as num).toInt() : null,
        vin: (j['vin'] as String?)?.trim().isEmpty ?? true ? null : j['vin'] as String?,
        center: j['center'] as String?,
        currentDriverId: j['current_driver_id'] as String?,
        mileage: j['mileage'] is num ? (j['mileage'] as num).toInt() : null,
        provider: j['provider'] as String?,
        vehicleType: j['vehicle_type'] as String?,
        fuelType: j['fuel_type'] as String?,
        workshopStatus: j['workshop_status'] as String?,
        workshopReason: j['workshop_reason'] as String?,
        itvDate: j['itv_date'] as String?,
        rentingEndDate: j['renting_end_date'] as String?,
        rentingBajaDate: j['renting_baja_date'] as String?,
        bagsRemaining: j['bags_remaining'] is num ? (j['bags_remaining'] as num).toInt() : null,
      );
}
