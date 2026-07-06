import 'dart:async';

import 'package:connectivity_plus/connectivity_plus.dart';
import 'package:flutter/material.dart';

/// Envuelve la app y muestra un aviso deslizante cuando no hay conexión.
/// Se coloca en `MaterialApp.builder` para cubrir todas las pantallas.
class ConnectivityBanner extends StatefulWidget {
  const ConnectivityBanner({super.key, required this.child});
  final Widget child;

  @override
  State<ConnectivityBanner> createState() => _ConnectivityBannerState();
}

class _ConnectivityBannerState extends State<ConnectivityBanner> {
  bool _offline = false;
  StreamSubscription<List<ConnectivityResult>>? _sub;

  @override
  void initState() {
    super.initState();
    _sub = Connectivity().onConnectivityChanged.listen(_update);
    Connectivity().checkConnectivity().then(_update);
  }

  void _update(List<ConnectivityResult> results) {
    final off = results.isEmpty || results.every((r) => r == ConnectivityResult.none);
    if (mounted && off != _offline) setState(() => _offline = off);
  }

  @override
  void dispose() {
    _sub?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final bottom = MediaQuery.paddingOf(context).bottom;
    return Stack(
      children: [
        widget.child,
        AnimatedPositioned(
          duration: const Duration(milliseconds: 260),
          curve: Curves.easeOutCubic,
          left: 12,
          right: 12,
          bottom: _offline ? bottom + 12 : -80,
          child: const _OfflinePill(),
        ),
      ],
    );
  }
}

class _OfflinePill extends StatelessWidget {
  const _OfflinePill();

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Colors.transparent,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
        decoration: BoxDecoration(
          color: const Color(0xFF1F2430),
          borderRadius: BorderRadius.circular(14),
          boxShadow: const [BoxShadow(color: Colors.black45, blurRadius: 16, offset: Offset(0, 6))],
        ),
        child: const Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(Icons.wifi_off_rounded, color: Colors.white, size: 18),
            SizedBox(width: 10),
            Expanded(
              child: Text('Sin conexión — reintentando…',
                  style: TextStyle(color: Colors.white, fontSize: 13, fontWeight: FontWeight.w600)),
            ),
          ],
        ),
      ),
    );
  }
}
