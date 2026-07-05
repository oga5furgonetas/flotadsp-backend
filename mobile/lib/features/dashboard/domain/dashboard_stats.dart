/// Estadísticas del panel principal (respuesta de `GET /stats/dashboard`).
class DashboardStats {
  const DashboardStats({
    required this.totalVehicles,
    required this.vehiclesInWorkshop,
    required this.totalDrivers,
    required this.totalInspections,
    required this.unreadAlerts,
    required this.openIncidents,
    required this.severity,
    required this.weekly,
  });

  final int totalVehicles;
  final int vehiclesInWorkshop;
  final int totalDrivers;
  final int totalInspections;
  final int unreadAlerts;
  final int openIncidents;

  /// severidad → nº de inspecciones (sin_danos, leve, moderado, grave, critico).
  final Map<String, int> severity;

  /// Actividad de los últimos días, ordenada por fecha ascendente.
  final List<DailyActivity> weekly;

  factory DashboardStats.fromJson(Map<String, dynamic> j) {
    final sev = <String, int>{};
    final rawSev = j['severity_breakdown'];
    if (rawSev is Map) {
      rawSev.forEach((k, v) => sev[k.toString()] = _int(v));
    }

    final weekly = <DailyActivity>[];
    final rawWeekly = j['weekly_activity'];
    if (rawWeekly is Map) {
      rawWeekly.forEach((date, value) {
        if (value is Map) {
          weekly.add(DailyActivity(
            date: date.toString(),
            inspections: _int(value['inspecciones']),
            damages: _int(value['danos']),
          ));
        }
      });
      weekly.sort((a, b) => a.date.compareTo(b.date));
    }

    return DashboardStats(
      totalVehicles: _int(j['total_vehicles']),
      vehiclesInWorkshop: _int(j['vehicles_in_workshop']),
      totalDrivers: _int(j['total_drivers']),
      totalInspections: _int(j['total_inspections']),
      unreadAlerts: _int(j['unread_alerts']),
      openIncidents: _int(j['open_incidents']),
      severity: sev,
      weekly: weekly,
    );
  }

  static int _int(Object? v) => v is num ? v.toInt() : int.tryParse('$v') ?? 0;
}

class DailyActivity {
  const DailyActivity({required this.date, required this.inspections, required this.damages});
  final String date;
  final int inspections;
  final int damages;
}
