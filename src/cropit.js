import $ from 'jquery';

import Zoomer from './zoomer';
import { CLASS_NAMES, ERRORS, EVENTS } from './constants';
import { loadDefaults } from './options';
import { exists, round, extend } from './utils';

class Cropit {
  constructor(jQuery, element, options) {
    this.$el = document.querySelector(element);

    const defaults = loadDefaults(this.$el);
    this.options = extend({}, defaults, options);

    this.init();
  }

  init() {
    this.image = new Image();
    this.preImage = new Image();
    this.image.onload = this.onImageLoaded.bind(this);
    this.preImage.onload = this.onPreImageLoaded.bind(this);
    this.image.onerror = this.preImage.onerror = () => {
      this.onImageError.call(this, ERRORS.IMAGE_FAILED_TO_LOAD);
    };

    this.$preview = this.options.$preview;
    this.$fileInput = this.options.$fileInput;
    this.$zoomSlider = this.options.$zoomSlider;

    this.$preview.style.position = 'relative';
    this.$fileInput.setAttribute('accept', 'image/*');
    this.$zoomSlider.setAttribute('min', 0);
    this.$zoomSlider.setAttribute('max', 1);
    this.$zoomSlider.setAttribute('step', 0.01);

    this.previewSize = {
      width: this.options.width || this.$preview.clientWidth,
      height: this.options.height || this.$preview.clientHeight,
    };

    this.$image = document.createElement("img");
    this.$image.classList.add(CLASS_NAMES.PREVIEW_IMAGE);
    this.$image.setAttribute('alt', '');
    this.$image.style.transformOrigin = 'top left';
    this.$image.style.webkitTransformOrigin = 'top left';
    this.$image.style.willChange = 'transform';

    this.$imageContainer = document.createElement("div");
    this.$imageContainer.classList.add(CLASS_NAMES.PREVIEW_IMAGE_CONTAINER);
    this.$imageContainer.style.position = 'absolute';
    this.$imageContainer.style.overflow = 'hidden';
    this.$imageContainer.style.left = 0;
    this.$imageContainer.style.top = 0;
    this.$imageContainer.style.width = '100%';
    this.$imageContainer.style.height = '100%';
    this.$imageContainer.appendChild(this.$image);

    this.$preview.appendChild(this.$imageContainer);

    if (this.options.imageBackground) {
      if (Array.isArray(this.options.imageBackgroundBorderWidth)) {
        this.bgBorderWidthArray = this.options.imageBackgroundBorderWidth;
      }
      else {
        this.bgBorderWidthArray = [0, 1, 2, 3].map(() => this.options.imageBackgroundBorderWidth);
      }

      this.$bg = document.createElement("img");
      this.$bg.classList.add(CLASS_NAMES.PREVIEW_BACKGROUND);
      this.$bg.setAttribute('alt', '');
      this.$bg.style.position = 'relative';
      this.$bg.style.left = this.bgBorderWidthArray[3];
      this.$bg.style.top = this.bgBorderWidthArray[0];
      this.$bg.style.transformOrigin = 'top left';
      this.$bg.style.webkitTransformOrigin = 'top left';
      this.$bg.style.willChange = 'transform';

      this.$bgContainer = document.createElement("div");
      this.$bgContainer.classList.add(CLASS_NAMES.PREVIEW_BACKGROUND_CONTAINER);
      this.$bgContainer.style.position = 'absolute';
      this.$bgContainer.style.zIndex = 0;
      this.$bgContainer.style.top = -this.bgBorderWidthArray[0];
      this.$bgContainer.style.right = -this.bgBorderWidthArray[1];
      this.$bgContainer.style.bottom = -this.bgBorderWidthArray[2];
      this.$bgContainer.style.left = -this.bgBorderWidthArray[3];
      this.$bgContainer.appendChild(this.$bg);

      if (this.bgBorderWidthArray[0] > 0) {
        this.$bgContainer.style.overflow =  'hidden';
      }
      this.$preview.appendChild(this.$bgContainer);
    }

    this.initialZoom = this.options.initialZoom;

    this.imageLoaded = false;

    this.moveContinue = false;

    this.zoomer = new Zoomer();

    this.bindListeners();

    if (this.options.imageState && this.options.imageState.src) {
      this.loadImage(this.options.imageState.src);
    }
  }

  bindListeners() {
    this.$fileInput.addEventListener('change.cropit', this.onFileChange.bind(this));
    this.$imageContainer.addEventListener(EVENTS.PREVIEW, this.onPreviewEvent.bind(this));
    this.$zoomSlider.addEventListener(EVENTS.ZOOM_INPUT, this.onZoomSliderChange.bind(this));

    if (this.options.allowDragNDrop) {
      this.$imageContainer.addEventListener('dragover.cropit dragleave.cropit', this.onDragOver.bind(this));
      this.$imageContainer.addEventListener('drop.cropit', this.onDrop.bind(this));
    }
  }

  unbindListeners() {
    this.$fileInput.removeEventListener('change.cropit');
    this.$imageContainer.removeEventListener(EVENTS.PREVIEW);
    this.$imageContainer.removeEventListener('dragover.cropit dragleave.cropit drop.cropit');
    this.$zoomSlider.removeEventListener(EVENTS.ZOOM_INPUT);
  }

  onFileChange(e) {
    this.options.onFileChange(e);

    if (this.$fileInput.files) {
      this.loadFile(this.$fileInput.files[0]);
    }
  }

  loadFile(file) {
    const fileReader = new FileReader();
    if (file && file.type.match('image')) {
      fileReader.readAsDataURL(file);
      fileReader.onload = this.onFileReaderLoaded.bind(this);
      fileReader.onerror = this.onFileReaderError.bind(this);
    }
    else if (file) {
      this.onFileReaderError();
    }
  }

  onFileReaderLoaded(e) {
    this.loadImage(e.target.result);
  }

  onFileReaderError() {
    this.options.onFileReaderError();
  }

  onDragOver(e) {
    e.preventDefault();
    e.originalEvent.dataTransfer.dropEffect = 'copy';
    this.$preview.classList.toggle(CLASS_NAMES.DRAG_HOVERED, e.type === 'dragover');
  }

  onDrop(e) {
    e.preventDefault();
    e.stopPropagation();

    const files = Array.prototype.slice.call(e.originalEvent.dataTransfer.files, 0);
    files.some((file) => {
      if (!file.type.match('image')) { return false; }

      this.loadFile(file);
      return true;
    });

    this.$preview.classList.remove(CLASS_NAMES.DRAG_HOVERED);
  }

  loadImage(imageSrc) {
    if (!imageSrc) { return; }

    this.options.onImageLoading();
    this.setImageLoadingClass();

    if (imageSrc.indexOf('data') === 0) {
      this.preImage.src = imageSrc;
    }
    else {
      const xhr = new XMLHttpRequest();
      xhr.onload = (e) => {
        if (e.target.status >= 300) {
          this.onImageError.call(this, ERRORS.IMAGE_FAILED_TO_LOAD);
          return;
        }

        this.loadFile(e.target.response);
      };
      xhr.open('GET', imageSrc);
      xhr.responseType = 'blob';
      xhr.send();
    }
  }

  onPreImageLoaded() {
    if (this.shouldRejectImage({
      imageWidth: this.preImage.width,
      imageHeight: this.preImage.height,
      previewSize: this.previewSize,
      maxZoom: this.options.maxZoom,
      exportZoom: this.options.exportZoom,
      smallImage: this.options.smallImage,
    })) {
      this.onImageError(ERRORS.SMALL_IMAGE);
      if (this.image.src) { this.setImageLoadedClass(); }
      return;
    }

    this.image.src = this.preImage.src;
  }

  onImageLoaded() {
    this.rotation = 0;
    this.setupZoomer(this.options.imageState && this.options.imageState.zoom || this._initialZoom);
    if (this.options.imageState && this.options.imageState.offset) {
      this.offset = this.options.imageState.offset;
    }
    else {
      this.centerImage();
    }

    this.options.imageState = {};
    this.$image.setAttribute('src', this.image.src);
    if (this.options.imageBackground) {
      this.$bg.setAttribute('src', this.image.src);
    }

    this.setImageLoadedClass();

    this.imageLoaded = true;

    this.options.onImageLoaded();
  }

  onImageError() {
    this.options.onImageError.apply(this, arguments);
    this.removeImageLoadingClass();
  }

  setImageLoadingClass() {
    this.$preview.classList.remove(CLASS_NAMES.IMAGE_LOADED);
    this.$preview.classList.add(CLASS_NAMES.IMAGE_LOADING);
  }

  setImageLoadedClass() {
    this.$preview.classList.remove(CLASS_NAMES.IMAGE_LOADING);
    this.$preview.classList.add(CLASS_NAMES.IMAGE_LOADED);
  }

  removeImageLoadingClass() {
    this.$preview.classList.remove(CLASS_NAMES.IMAGE_LOADING);
  }

  getEventPosition(e) {
    if (e.originalEvent && e.originalEvent.touches && e.originalEvent.touches[0]) {
      e = e.originalEvent.touches[0];
    }
    if (e.clientX && e.clientY) {
      return { x: e.clientX, y: e.clientY };
    }
  }

  onPreviewEvent(e) {
    if (!this.imageLoaded) { return; }

    this.moveContinue = false;
    this.$imageContainer.removeEventListener(EVENTS.PREVIEW_MOVE);

    if (e.type === 'mousedown' || e.type === 'touchstart') {
      this.origin = this.getEventPosition(e);
      this.moveContinue = true;
      this.$imageContainer.addEventListener(EVENTS.PREVIEW_MOVE, this.onMove.bind(this));
    }
    else {
      document.body.focus();
    }

    e.stopPropagation();
    return false;
  }

  onMove(e) {
    const eventPosition = this.getEventPosition(e);

    if (this.moveContinue && eventPosition) {
      this.offset = {
        x: this.offset.x + eventPosition.x - this.origin.x,
        y: this.offset.y + eventPosition.y - this.origin.y,
      };
    }

    this.origin = eventPosition;

    e.stopPropagation();
    return false;
  }

  set offset(position) {
    if (!position || !exists(position.x) || !exists(position.y)) { return; }

    this._offset = this.fixOffset(position);
    this.renderImage();

    this.options.onOffsetChange(position);
  }

  fixOffset(offset) {
    if (!this.imageLoaded) { return offset; }

    const ret = { x: offset.x, y: offset.y };

    if (!this.options.freeMove) {
      if (this.imageWidth * this.zoom >= this.previewSize.width) {
        ret.x = Math.min(0, Math.max(ret.x,
          this.previewSize.width - this.imageWidth * this.zoom));
      }
      else {
        ret.x = Math.max(0, Math.min(ret.x,
          this.previewSize.width - this.imageWidth * this.zoom));
      }

      if (this.imageHeight * this.zoom >= this.previewSize.height) {
        ret.y = Math.min(0, Math.max(ret.y,
          this.previewSize.height - this.imageHeight * this.zoom));
      }
      else {
        ret.y = Math.max(0, Math.min(ret.y,
          this.previewSize.height - this.imageHeight * this.zoom));
      }
    }

    ret.x = round(ret.x);
    ret.y = round(ret.y);

    return ret;
  }

  centerImage() {
    if (!this.image.width || !this.image.height || !this.zoom) { return; }

    this.offset = {
      x: (this.previewSize.width - this.imageWidth * this.zoom) / 2,
      y: (this.previewSize.height - this.imageHeight * this.zoom) / 2,
    };
  }

  onZoomSliderChange() {
    if (!this.imageLoaded) { return; }

    this.zoomSliderPos = Number(this.$zoomSlider.val());
    const newZoom = this.zoomer.getZoom(this.zoomSliderPos);
    if (newZoom === this.zoom) { return; }
    this.zoom = newZoom;
  }

  enableZoomSlider() {
    this.$zoomSlider.removeAttribute('disabled');
    this.options.onZoomEnabled();
  }

  disableZoomSlider() {
    this.$zoomSlider.setAttribute('disabled', true);
    this.options.onZoomDisabled();
  }

  setupZoomer(zoom) {
    this.zoomer.setup({
      imageSize: this.imageSize,
      previewSize: this.previewSize,
      exportZoom: this.options.exportZoom,
      maxZoom: this.options.maxZoom,
      minZoom: this.options.minZoom,
      smallImage: this.options.smallImage,
    });
    this.zoom = exists(zoom) ? zoom : this._zoom;

    if (this.isZoomable()) {
      this.enableZoomSlider();
    }
    else {
      this.disableZoomSlider();
    }
  }

  set zoom(newZoom) {
    newZoom = this.fixZoom(newZoom);

    if (this.imageLoaded) {
      const oldZoom = this.zoom;

      const newX = this.previewSize.width / 2 - (this.previewSize.width / 2 - this.offset.x) * newZoom / oldZoom;
      const newY = this.previewSize.height / 2 - (this.previewSize.height / 2 - this.offset.y) * newZoom / oldZoom;

      this._zoom = newZoom;
      this.offset = { x: newX, y: newY }; // Triggers renderImage()
    }
    else {
      this._zoom = newZoom;
    }

    this.zoomSliderPos = this.zoomer.getSliderPos(this.zoom);
    this.$zoomSlider.val(this.zoomSliderPos);

    this.options.onZoomChange(newZoom);
  }

  fixZoom(zoom) {
    return this.zoomer.fixZoom(zoom);
  }

  isZoomable() {
    return this.zoomer.isZoomable();
  }

  get rotatedOffset() {
    return {
      x: this.offset.x +
          (this.rotation === 90 ? this.image.height * this.zoom : 0) +
          (this.rotation === 180 ? this.image.width * this.zoom : 0),
      y: this.offset.y +
          (this.rotation === 180 ? this.image.height * this.zoom : 0) +
          (this.rotation === 270 ? this.image.width * this.zoom : 0),
    };
  }

  renderImage() {
    const transformation = `
      translate(${this.rotatedOffset.x}px, ${this.rotatedOffset.y}px)
      scale(${this.zoom})
      rotate(${this.rotation}deg)`;

    this.$image.css({
      transform: transformation,
      webkitTransform: transformation,
    });
    if (this.options.imageBackground) {
      this.$bg.css({
        transform: transformation,
        webkitTransform: transformation,
      });
    }
  }

  set rotation(newRotation) {
    this._rotation = newRotation;

    if (this.imageLoaded) {
      // Change in image size may lead to change in zoom range
      this.setupZoomer();
    }
  }

  get rotation() {
    return this._rotation;
  }

  rotateCW() {
    if (this.shouldRejectImage({
      imageWidth: this.image.height,
      imageHeight: this.image.width,
      previewSize: this.previewSize,
      maxZoom: this.options.maxZoom,
      exportZoom: this.options.exportZoom,
      smallImage: this.options.smallImage,
    })) {
      this.rotation = (this.rotation + 180) % 360;
    }
    else {
      this.rotation = (this.rotation + 90) % 360;
    }
  }

  rotateCCW() {
    if (this.shouldRejectImage({
      imageWidth: this.image.height,
      imageHeight: this.image.width,
      previewSize: this.previewSize,
      maxZoom: this.options.maxZoom,
      exportZoom: this.options.exportZoom,
      smallImage: this.options.smallImage,
    })) {
      this.rotation = (this.rotation + 180) % 360;
    }
    else {
      this.rotation = (this.rotation + 270) % 360;
    }
  }

  shouldRejectImage({ imageWidth, imageHeight, previewSize, maxZoom, exportZoom, smallImage }) {
    if (smallImage !== 'reject') { return false; }

    return imageWidth * maxZoom < previewSize.width * exportZoom ||
           imageHeight * maxZoom < previewSize.height * exportZoom;
  }

  getCroppedImageData(exportOptions) {
    if (!this.image.src) { return; }

    const exportDefaults = {
      type: 'image/png',
      quality: 0.75,
      originalSize: false,
      fillBg: '#fff',
    };
    exportOptions = extend({}, exportDefaults, exportOptions);

    const exportZoom = exportOptions.originalSize ? 1 / this.zoom : this.options.exportZoom;

    const zoomedSize = {
      width: this.zoom * exportZoom * this.image.width,
      height: this.zoom * exportZoom * this.image.height,
    };

    const canvas = document.createElement('canvas');
    canvas.setAttribute('width', this.previewSize.width * exportZoom);
    canvas.setAttribute('height', this.previewSize.height * exportZoom);
    const canvasContext = canvas.getContext('2d');

    if (exportOptions.type === 'image/jpeg') {
      canvasContext.fillStyle = exportOptions.fillBg;
      canvasContext.fillRect(0, 0, canvas.width, canvas.height);
    }

    canvasContext.translate(
      this.rotatedOffset.x * exportZoom,
      this.rotatedOffset.y * exportZoom);
    canvasContext.rotate(this.rotation * Math.PI / 180);
    canvasContext.drawImage(this.image,
      0, 0,
      zoomedSize.width,
      zoomedSize.height);

    return canvas.toDataURL(exportOptions.type, exportOptions.quality);
  }

  get imageState() {
    return {
      src: this.image.src,
      offset: this.offset,
      zoom: this.zoom,
    };
  }

  get imageSrc() {
    return this.image.src;
  }

  set imageSrc(imageSrc) {
    this.loadImage(imageSrc);
  }

  get offset() {
    return this._offset;
  }

  get zoom() {
    return this._zoom;
  }

  get imageWidth() {
    return this.rotation % 180 === 0 ? this.image.width : this.image.height;
  }

  get imageHeight() {
    return this.rotation % 180 === 0 ? this.image.height : this.image.width;
  }

  get imageSize() {
    return {
      width: this.imageWidth,
      height: this.imageHeight,
    };
  }

  get initialZoom() {
    return this.options.initialZoom;
  }

  set initialZoom(initialZoomOption) {
    this.options.initialZoom = initialZoomOption;
    if (initialZoomOption === 'min') {
      this._initialZoom = 0; // Will be fixed when image loads
    }
    else if (initialZoomOption === 'image') {
      this._initialZoom = 1;
    }
    else {
      this._initialZoom = 0;
    }
  }

  get exportZoom() {
    return this.options.exportZoom;
  }

  set exportZoom(exportZoom) {
    this.options.exportZoom = exportZoom;
    this.setupZoomer();
  }

  get minZoom() {
    return this.options.minZoom;
  }

  set minZoom(minZoom) {
    this.options.minZoom = minZoom;
    this.setupZoomer();
  }

  get maxZoom() {
    return this.options.maxZoom;
  }

  set maxZoom(maxZoom) {
    this.options.maxZoom = maxZoom;
    this.setupZoomer();
  }

  get previewSize() {
    return this._previewSize;
  }

  set previewSize(size) {
    if (!size || size.width <= 0 || size.height <= 0) { return; }

    this._previewSize = {
      width: size.width,
      height: size.height,
    };
    this.$preview
      .innerWidth(this.previewSize.width)
      .innerHeight(this.previewSize.height);

    if (this.imageLoaded) {
      this.setupZoomer();
    }
  }

  disable() {
    this.unbindListeners();
    this.disableZoomSlider();
    this.$el.classList.add(CLASS_NAMES.DISABLED);
  }

  reenable() {
    this.bindListeners();
    this.enableZoomSlider();
    this.$el.classList.remove(CLASS_NAMES.DISABLED);
  }

  $(selector) {
    if (!this.$el) { return null; }
    return this.$el.find(selector);
  }
}

export default Cropit;
