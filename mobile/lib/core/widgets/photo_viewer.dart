import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:photo_view/photo_view.dart';
import 'package:photo_view/photo_view_gallery.dart';

/// Visor de fotos a pantalla completa con pinch-to-zoom y swipe entre fotos.
class PhotoViewerScreen extends StatefulWidget {
  const PhotoViewerScreen({super.key, required this.urls, this.initialIndex = 0});

  final List<String> urls;
  final int initialIndex;

  static Future<void> open(BuildContext context, List<String> urls, int index) {
    return Navigator.of(context).push(
      MaterialPageRoute(
        fullscreenDialog: true,
        builder: (_) => PhotoViewerScreen(urls: urls, initialIndex: index),
      ),
    );
  }

  @override
  State<PhotoViewerScreen> createState() => _PhotoViewerScreenState();
}

class _PhotoViewerScreenState extends State<PhotoViewerScreen> {
  late final PageController _controller = PageController(initialPage: widget.initialIndex);
  late int _index = widget.initialIndex;

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.black,
      appBar: AppBar(
        backgroundColor: Colors.black,
        foregroundColor: Colors.white,
        title: Text('${_index + 1} / ${widget.urls.length}', style: const TextStyle(fontSize: 15)),
      ),
      body: PhotoViewGallery.builder(
        pageController: _controller,
        itemCount: widget.urls.length,
        onPageChanged: (i) => setState(() => _index = i),
        backgroundDecoration: const BoxDecoration(color: Colors.black),
        builder: (context, i) => PhotoViewGalleryPageOptions(
          imageProvider: CachedNetworkImageProvider(widget.urls[i]),
          minScale: PhotoViewComputedScale.contained,
          maxScale: PhotoViewComputedScale.covered * 3,
        ),
        loadingBuilder: (_, _) => const Center(
          child: CircularProgressIndicator(color: Colors.white),
        ),
      ),
    );
  }
}
