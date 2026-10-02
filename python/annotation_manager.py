from __future__ import annotations

import math
from contextlib import contextmanager
from pathlib import Path
from typing import Any

from matplotlib.lines import Line2D
from matplotlib.patches import FancyArrowPatch, Rectangle

from annotation_model import (
    AnnotationCollection,
    AnnotationType,
    ArrowAnnotation,
    SegmentAnnotation,
    TextAnnotation,
    annotation_from_dict,
    generate_annotation_id,
)


ANNOTATION_HANDLE_MARKERSIZE = 3.5
ANNOTATION_HANDLE_PICKER = 8
ANNOTATION_HANDLE_EDGEWIDTH = 0.9


class AnnotationManager:
    def __init__(
        self,
        annotations: AnnotationCollection,
        *,
        on_change=None,
        before_change=None,
        text_editor=None,
        on_mode_change=None,
        on_selection_change=None,
        on_activate=None,
        logger=None,
    ) -> None:
        self.annotations = annotations
        self.on_change = on_change
        self.before_change = before_change
        self.text_editor = text_editor
        self.on_mode_change = on_mode_change
        self.on_selection_change = on_selection_change
        self.on_activate = on_activate
        self.logger = logger
        self.figure = None
        self.axes: dict[str, Any] = {}
        self.canvas = None
        self.artist_by_id: dict[str, Any] = {}
        self.selected_id: str | None = None
        self.selected_ids: set[str] = set()
        self.handle_artists: list[Any] = []
        self.handle_roles: dict[Any, str] = {}
        self.event_connection_ids: list[int] = []
        self.mode = "normal"
        self.drag_state: dict[str, Any] | None = None
        self.range_select_state: dict[str, Any] | None = None
        self.range_select_artist = None
        self._shift_pressed = False
        self._creating_arrow_id: str | None = None
        self._creating_segment_id: str | None = None
        self._pending_arrow_style = "->"
        self.annotation_clipboard: dict[str, Any] | None = None

    def _log_warn(self, message: str) -> None:
        if self.logger is None:
            return
        try:
            self.logger(f"[WARN] {message}")
        except Exception:
            pass

    def attach(self, figure, axes, canvas=None) -> None:
        self.detach()
        self.figure = figure
        self.canvas = canvas
        if isinstance(axes, dict):
            self.axes = dict(axes)
        elif axes is not None:
            self.axes = {"primary": axes}
        else:
            self.axes = {}
        self.rebuild_all_artists()
        self.connect_events()
        if self.selected_id and self.annotations.get(self.selected_id) is not None:
            self.selected_ids = {annotation_id for annotation_id in self.selected_ids if self.annotations.get(annotation_id) is not None}
            self.selected_ids.add(self.selected_id)
            self._show_handles_for_selected()
        else:
            self.selected_id = None
            self.selected_ids.clear()
            self._remove_handles()
        self.draw_idle()
        self._sync_cursor()

    def detach(self) -> None:
        self.disconnect_events()
        self._remove_handles()
        self._remove_range_select_artist()
        for artist in list(self.artist_by_id.values()):
            self._remove_artist_ref(artist)
        self.artist_by_id.clear()
        self.figure = None
        self.axes = {}
        self.canvas = None
        self.drag_state = None
        self.mode = "normal"
        self._shift_pressed = False
        self._creating_arrow_id = None
        self._creating_segment_id = None

    def connect_events(self) -> None:
        self.disconnect_events()
        if self.canvas is None:
            return
        try:
            self.event_connection_ids.append(self.canvas.mpl_connect("draw_event", self._on_draw))
            self.event_connection_ids.append(self.canvas.mpl_connect("button_press_event", self._on_button_press))
            self.event_connection_ids.append(self.canvas.mpl_connect("motion_notify_event", self._on_motion))
            self.event_connection_ids.append(self.canvas.mpl_connect("button_release_event", self._on_button_release))
            self.event_connection_ids.append(self.canvas.mpl_connect("figure_leave_event", self._on_figure_leave))
            self.event_connection_ids.append(self.canvas.mpl_connect("key_press_event", self._on_key_press))
            self.event_connection_ids.append(self.canvas.mpl_connect("key_release_event", self._on_key_release))
        except Exception as e:
            self._log_warn(f"Failed to connect annotation events: {e}")

    def disconnect_events(self) -> None:
        if self.canvas is not None:
            for cid in self.event_connection_ids:
                try:
                    self.canvas.mpl_disconnect(cid)
                except Exception:
                    pass
        self.event_connection_ids.clear()

    def draw_idle(self) -> None:
        if self.canvas is None:
            return
        try:
            self.canvas.draw_idle()
        except Exception:
            pass

    def _on_draw(self, _event=None) -> None:
        self.update_handles(redraw=False)

    def _notify_before_change(self) -> None:
        if self.before_change is None:
            return
        try:
            self.before_change()
        except Exception:
            pass

    def _notify_change(self) -> None:
        if self.on_change is None:
            return
        try:
            self.on_change()
        except Exception:
            pass

    def _notify_mode_change(self) -> None:
        if self.on_mode_change is None:
            return
        try:
            self.on_mode_change(self.mode)
        except Exception:
            pass

    def _notify_selection_change(self) -> None:
        if self.on_selection_change is None:
            return
        try:
            self.on_selection_change(self.get_selected())
        except Exception:
            pass

    def _notify_activate(self, annotation: AnnotationType | None) -> None:
        if self.on_activate is None:
            return
        try:
            self.on_activate(annotation)
        except Exception:
            pass

    def _annotation_transform(self, annotation: AnnotationType, ax):
        if isinstance(annotation, TextAnnotation) and getattr(annotation, "coordinate_system", "data") == "axes_fraction":
            return ax.transAxes
        return ax.transData

    def _update_annotation_artist(self, annotation: AnnotationType) -> None:
        if isinstance(annotation, TextAnnotation):
            self._update_text_artist(annotation)
        elif isinstance(annotation, ArrowAnnotation):
            self._update_arrow_artist(annotation)
        elif isinstance(annotation, SegmentAnnotation):
            self._update_segment_artist(annotation)

    def set_selected_property(self, name: str, value: Any, *, notify: bool = True, before: bool = True) -> bool:
        annotations = [
            annotation
            for annotation in self.get_selected_annotations()
            if not annotation.locked and hasattr(annotation, name)
        ]
        if not annotations:
            return False
        if before:
            self._notify_before_change()
        for annotation in annotations:
            setattr(annotation, name, value)
            if isinstance(annotation, TextAnnotation):
                if name == "bold":
                    annotation.font_weight = "bold" if bool(value) else "normal"
                elif name == "italic":
                    annotation.font_style = "italic" if bool(value) else "normal"
                elif name == "font_weight":
                    annotation.bold = str(value).lower() == "bold"
                elif name == "font_style":
                    annotation.italic = str(value).lower() == "italic"
            self._update_annotation_artist(annotation)
        self.update_handles(redraw=False)
        self.draw_idle()
        self._notify_selection_change()
        if notify:
            self._notify_change()
        return True

    def move_selected_to_front(self) -> bool:
        annotation = self.get_selected()
        if annotation is None:
            return False
        self._notify_before_change()
        zorders = [float(getattr(item, "zorder", 20.0)) for item in self.annotations.items]
        annotation.zorder = (max(zorders) if zorders else 20.0) + 1.0
        self._update_annotation_artist(annotation)
        self.update_handles(redraw=False)
        self.draw_idle()
        self._notify_selection_change()
        self._notify_change()
        return True

    def move_selected_to_back(self) -> bool:
        annotation = self.get_selected()
        if annotation is None:
            return False
        self._notify_before_change()
        zorders = [float(getattr(item, "zorder", 20.0)) for item in self.annotations.items]
        annotation.zorder = max(2.0, (min(zorders) if zorders else 20.0) - 1.0)
        self._update_annotation_artist(annotation)
        self.update_handles(redraw=False)
        self.draw_idle()
        self._notify_selection_change()
        self._notify_change()
        return True

    def start_text_mode(self) -> None:
        self._cancel_arrow_creation()
        self._cancel_segment_creation()
        self.mode = "add_text"
        self.drag_state = None
        self.clear_selection()
        self._sync_cursor()
        self._notify_mode_change()

    def cancel_text_mode(self) -> None:
        if self.mode == "add_text":
            self.mode = "normal"
            self._sync_cursor()
            self._notify_mode_change()

    def start_arrow_mode(self, arrow_style: str | None = None) -> None:
        self.cancel_text_mode()
        self._cancel_arrow_creation()
        self._cancel_segment_creation()
        self._pending_arrow_style = str(arrow_style or "->")
        self.mode = "add_arrow"
        self.drag_state = None
        self.clear_selection()
        self._sync_cursor()
        self._notify_mode_change()

    def cancel_arrow_mode(self) -> None:
        if self.mode == "add_arrow" or self._creating_arrow_id is not None:
            self._cancel_arrow_creation()
            self.mode = "normal"
            self._sync_cursor()
            self._notify_mode_change()

    def _cancel_arrow_creation(self) -> None:
        if self._creating_arrow_id is not None:
            annotation_id = self._creating_arrow_id
            self.annotations.remove(annotation_id)
            self.remove_artist(annotation_id)
            if self.selected_id == annotation_id:
                self.selected_id = None
            self._creating_arrow_id = None
        if self.drag_state and self.drag_state.get("role") == "create_arrow":
            self.drag_state = None

    def start_segment_mode(self) -> None:
        self.cancel_text_mode()
        self._cancel_arrow_creation()
        self._cancel_segment_creation()
        self.mode = "add_segment"
        self.drag_state = None
        self.clear_selection()
        self._sync_cursor()
        self._notify_mode_change()

    def cancel_segment_mode(self) -> None:
        if self.mode == "add_segment" or self._creating_segment_id is not None:
            self._cancel_segment_creation()
            self.mode = "normal"
            self._sync_cursor()
            self._notify_mode_change()

    def _cancel_segment_creation(self) -> None:
        if self._creating_segment_id is not None:
            annotation_id = self._creating_segment_id
            self.annotations.remove(annotation_id)
            self.remove_artist(annotation_id)
            if self.selected_id == annotation_id:
                self.selected_id = None
            self._creating_segment_id = None
        if self.drag_state and self.drag_state.get("role") == "create_segment":
            self.drag_state = None

    def _toolbar_active(self) -> bool:
        toolbar = getattr(self.canvas, "toolbar", None) if self.canvas is not None else None
        mode = getattr(toolbar, "mode", "")
        try:
            mode = str(mode)
        except Exception:
            mode = ""
        return bool(mode.strip())

    def _tk_widget(self):
        if self.canvas is None:
            return None
        try:
            return self.canvas.get_tk_widget()
        except Exception:
            return None

    def _sync_cursor(self, cursor: str | None = None) -> None:
        widget = self._tk_widget()
        if widget is None:
            return
        if cursor is None:
            cursor = "crosshair" if self.mode in {"add_text", "add_arrow", "add_segment"} else ""
        try:
            widget.configure(cursor=cursor)
        except Exception:
            pass

    def _axis_for(self, annotation: AnnotationType):
        return self.axes.get(annotation.axes_id) or self.axes.get("primary")

    def _remove_artist_ref(self, artist) -> None:
        if isinstance(artist, (list, tuple)):
            for item in artist:
                self._remove_artist_ref(item)
            return
        try:
            artist.remove()
        except Exception:
            pass

    def _primary_artist(self, artist):
        if isinstance(artist, (list, tuple)):
            return artist[0] if artist else None
        return artist

    def remove_artist(self, annotation_id: str) -> None:
        artist = self.artist_by_id.pop(annotation_id, None)
        if artist is not None:
            self._remove_artist_ref(artist)
        if self.selected_id == annotation_id:
            self._remove_handles()

    def refresh_annotation(self, annotation_id: str) -> None:
        self.remove_artist(annotation_id)
        annotation = self.annotations.get(annotation_id)
        if annotation is None:
            if self.selected_id == annotation_id:
                self.selected_id = None
            self.draw_idle()
            return
        artist = self._create_artist(annotation)
        if artist is not None:
            self.artist_by_id[annotation_id] = artist
        if self.selected_id == annotation_id:
            self._show_handles_for_selected()
        self.draw_idle()

    def _update_text_artist(self, annotation: TextAnnotation) -> None:
        artist = self.artist_by_id.get(annotation.id)
        if artist is None:
            self.refresh_annotation(annotation.id)
            return
        try:
            artist.set_position((annotation.x, annotation.y))
            artist.set_text(annotation.text)
            artist.set_rotation(annotation.rotation)
            try:
                artist.set_rotation_mode("anchor")
            except Exception:
                pass
            artist.set_fontsize(annotation.font_size)
            artist.set_color(annotation.color)
            artist.set_alpha(annotation.opacity)
            artist.set_fontweight(annotation.font_weight)
            artist.set_fontstyle(annotation.font_style)
            artist.set_fontfamily(annotation.font_family)
            artist.set_ha(annotation.horizontal_alignment)
            artist.set_va(annotation.vertical_alignment)
            artist.set_transform(self._annotation_transform(annotation, artist.axes))
            artist.set_visible(annotation.visible)
            artist.set_zorder(annotation.zorder)
            artist.set_clip_on(False)
        except Exception:
            self.refresh_annotation(annotation.id)

    def _update_arrow_artist(self, annotation: ArrowAnnotation) -> None:
        self.refresh_annotation(annotation.id)

    def _update_segment_artist(self, annotation: SegmentAnnotation) -> None:
        artist = self.artist_by_id.get(annotation.id)
        if artist is None:
            self.refresh_annotation(annotation.id)
            return
        try:
            artist.set_data([annotation.x1, annotation.x2], [annotation.y1, annotation.y2])
            artist.set_color(annotation.color)
            artist.set_alpha(annotation.opacity)
            artist.set_linewidth(annotation.line_width)
            artist.set_linestyle(annotation.line_style)
            artist.set_visible(annotation.visible)
            artist.set_zorder(annotation.zorder)
            artist.set_clip_on(False)
        except Exception:
            self.refresh_annotation(annotation.id)

    def rebuild_all_artists(self) -> None:
        self._remove_handles()
        for artist in list(self.artist_by_id.values()):
            self._remove_artist_ref(artist)
        self.artist_by_id.clear()
        for annotation in list(self.annotations.items):
            artist = self._create_artist(annotation)
            if artist is not None:
                self.artist_by_id[annotation.id] = artist

    def refresh_all(self) -> None:
        if self.figure is None:
            return
        self.rebuild_all_artists()
        if self.selected_id and self.annotations.get(self.selected_id) is not None:
            self._show_handles_for_selected()
        else:
            self.selected_id = None
        self.draw_idle()
        self._notify_selection_change()

    def _create_artist(self, annotation: AnnotationType):
        ax = self._axis_for(annotation)
        if ax is None:
            self._log_warn(f"Failed to render annotation {annotation.id}: axes not found.")
            return None
        try:
            if isinstance(annotation, TextAnnotation):
                return ax.text(
                    annotation.x,
                    annotation.y,
                    annotation.text,
                    rotation=annotation.rotation,
                    rotation_mode="anchor",
                    fontsize=annotation.font_size,
                    color=annotation.color,
                    alpha=annotation.opacity,
                    fontweight=annotation.font_weight,
                    fontstyle=annotation.font_style,
                    fontfamily=annotation.font_family,
                    ha=annotation.horizontal_alignment,
                    va=annotation.vertical_alignment,
                    transform=self._annotation_transform(annotation, ax),
                    zorder=annotation.zorder,
                    visible=annotation.visible,
                    clip_on=False,
                )
            if isinstance(annotation, ArrowAnnotation):
                arrow_style, start_circle, end_circle = self._resolved_arrow_style(annotation.arrow_style)
                artist = FancyArrowPatch(
                    (annotation.x1, annotation.y1),
                    (annotation.x2, annotation.y2),
                    arrowstyle=arrow_style,
                    mutation_scale=annotation.arrow_size,
                    linewidth=annotation.line_width,
                    linestyle=annotation.line_style,
                    color=annotation.color,
                    alpha=annotation.opacity,
                    zorder=annotation.zorder,
                    visible=annotation.visible,
                    clip_on=False,
                )
                ax.add_patch(artist)
                artists: list[Any] = [artist]
                circle_style = {
                    "marker": "o",
                    "markersize": max(4.0, float(annotation.arrow_size) * 0.72),
                    "markerfacecolor": annotation.color,
                    "markeredgecolor": annotation.color,
                    "alpha": annotation.opacity,
                    "linestyle": "None",
                    "zorder": annotation.zorder,
                    "visible": annotation.visible,
                    "clip_on": False,
                }
                if start_circle:
                    start = Line2D([annotation.x1], [annotation.y1], **circle_style)
                    ax.add_line(start)
                    artists.append(start)
                if end_circle:
                    end = Line2D([annotation.x2], [annotation.y2], **circle_style)
                    ax.add_line(end)
                    artists.append(end)
                return artists[0] if len(artists) == 1 else artists
            if isinstance(annotation, SegmentAnnotation):
                artist = Line2D(
                    [annotation.x1, annotation.x2],
                    [annotation.y1, annotation.y2],
                    linewidth=annotation.line_width,
                    linestyle=annotation.line_style,
                    color=annotation.color,
                    alpha=annotation.opacity,
                    zorder=annotation.zorder,
                    visible=annotation.visible,
                    clip_on=False,
                )
                ax.add_line(artist)
                return artist
        except Exception as e:
            self._log_warn(f"Failed to render annotation {annotation.id}: {e}")
        return None

    def select(self, annotation_id: str | None) -> bool:
        if annotation_id is None:
            self.clear_selection()
            return True
        if self.annotations.get(annotation_id) is None:
            return False
        self.selected_id = annotation_id
        self.selected_ids = {annotation_id}
        self._show_handles_for_selected()
        self.draw_idle()
        self._notify_selection_change()
        return True

    def toggle_selection(self, annotation_id: str) -> bool:
        if self.annotations.get(annotation_id) is None:
            return False
        if annotation_id in self.selected_ids:
            self.selected_ids.remove(annotation_id)
            if self.selected_id == annotation_id:
                self.selected_id = next((item.id for item in self.annotations.items if item.id in self.selected_ids), None)
        else:
            self.selected_ids.add(annotation_id)
            self.selected_id = annotation_id
        if not self.selected_ids:
            self.selected_id = None
        self._show_handles_for_selected()
        self.draw_idle()
        self._notify_selection_change()
        return True

    def select_many(self, annotation_ids: list[str] | set[str], *, additive: bool = False, redraw: bool = True) -> bool:
        ids = {annotation_id for annotation_id in annotation_ids if self.annotations.get(annotation_id) is not None}
        if additive:
            self.selected_ids = {annotation_id for annotation_id in self.selected_ids if self.annotations.get(annotation_id) is not None}
            self.selected_ids.update(ids)
        else:
            self.selected_ids = ids
        self.selected_id = next((item.id for item in self.annotations.items if item.id in self.selected_ids), None)
        self._show_handles_for_selected()
        if redraw:
            self.draw_idle()
        self._notify_selection_change()
        return bool(self.selected_ids)

    def clear_selection(self) -> None:
        self.selected_id = None
        self.selected_ids.clear()
        self._remove_handles()
        self.draw_idle()
        self._notify_selection_change()

    def get_selected(self) -> AnnotationType | None:
        if not self.selected_id:
            return None
        return self.annotations.get(self.selected_id)

    def get_selected_annotations(self) -> list[AnnotationType]:
        selected = [self.annotations.get(annotation_id) for annotation_id in self.selected_ids]
        return [item for item in selected if isinstance(item, (TextAnnotation, ArrowAnnotation, SegmentAnnotation))]

    def copy_selected_annotation(self) -> bool:
        annotation = self.get_selected()
        if not isinstance(annotation, (TextAnnotation, ArrowAnnotation, SegmentAnnotation)):
            return False
        self.annotation_clipboard = annotation.to_dict()
        self._notify_selection_change()
        return True

    def can_paste_annotation(self) -> bool:
        return annotation_from_dict(self.annotation_clipboard) is not None

    def paste_annotation(self) -> bool:
        annotation = annotation_from_dict(self.annotation_clipboard)
        if not isinstance(annotation, (TextAnnotation, ArrowAnnotation, SegmentAnnotation)):
            return False
        annotation.id = generate_annotation_id(annotation.type or "annotation")
        self._offset_pasted_annotation(annotation)
        self._notify_before_change()
        annotation = self.annotations.add(annotation)
        artist = self._create_artist(annotation)
        if artist is not None:
            self.artist_by_id[annotation.id] = artist
        self.selected_id = annotation.id
        self.selected_ids = {annotation.id}
        self._show_handles_for_selected()
        self.draw_idle()
        self._notify_change()
        self._notify_selection_change()
        return True

    def _paste_delta_for_annotation(self, annotation: AnnotationType) -> tuple[float, float]:
        ax = self._axis_for(annotation)
        if ax is None:
            return (0.03, 0.03)
        try:
            x0, x1 = ax.get_xlim()
            y0, y1 = ax.get_ylim()
            dx = (float(x1) - float(x0)) * 0.03
            dy = (float(y1) - float(y0)) * 0.03
            if math.isfinite(dx) and math.isfinite(dy) and dx != 0.0 and dy != 0.0:
                return (dx, dy)
        except Exception:
            pass
        return (0.03, 0.03)

    def _offset_pasted_annotation(self, annotation: AnnotationType) -> None:
        dx, dy = self._paste_delta_for_annotation(annotation)
        if isinstance(annotation, TextAnnotation):
            annotation.x += dx
            annotation.y += dy
        elif isinstance(annotation, (ArrowAnnotation, SegmentAnnotation)):
            annotation.x1 += dx
            annotation.x2 += dx
            annotation.y1 += dy
            annotation.y2 += dy

    def _remove_handles(self) -> None:
        for artist in list(self.handle_artists):
            self._remove_artist_ref(artist)
        self.handle_artists.clear()
        self.handle_roles.clear()

    def _remove_range_select_artist(self) -> None:
        if self.range_select_artist is not None:
            artist = self.range_select_artist
            try:
                artist.set_visible(False)
            except Exception:
                pass
            self._remove_artist_ref(self.range_select_artist)
            if self.figure is not None:
                try:
                    while artist in self.figure.patches:
                        self.figure.patches.remove(artist)
                except Exception:
                    pass
            self.range_select_artist = None

    def _handle_style(self, role: str = "rotate") -> dict[str, Any]:
        if role in {"arrow_start", "arrow_end", "segment_start", "segment_end"}:
            return {
                "marker": "o",
                "markersize": ANNOTATION_HANDLE_MARKERSIZE,
                "markerfacecolor": "#FFFFFF" if role in {"arrow_start", "segment_start"} else "#DCEEFF",
                "markeredgecolor": "#0B67A3",
                "markeredgewidth": ANNOTATION_HANDLE_EDGEWIDTH,
                "linestyle": "None",
                "zorder": 1000,
                "visible": True,
                "clip_on": False,
                "picker": ANNOTATION_HANDLE_PICKER,
            }
        if role == "rotate":
            return {
                "marker": "o",
                "markersize": ANNOTATION_HANDLE_MARKERSIZE,
                "markerfacecolor": "#FFFFFF",
                "markeredgecolor": "#0B67A3",
                "markeredgewidth": ANNOTATION_HANDLE_EDGEWIDTH,
                "linestyle": "None",
                "zorder": 1000,
                "visible": True,
                "clip_on": False,
                "picker": ANNOTATION_HANDLE_PICKER,
            }
        return {
            "marker": "s",
            "markersize": ANNOTATION_HANDLE_MARKERSIZE,
            "markerfacecolor": "#FFFFFF",
            "markeredgecolor": "#005A9E",
            "markeredgewidth": ANNOTATION_HANDLE_EDGEWIDTH,
            "linestyle": "None",
            "zorder": 1000,
            "visible": True,
            "clip_on": False,
            "picker": ANNOTATION_HANDLE_PICKER,
        }

    def _guide_style(self) -> dict[str, Any]:
        return {
            "linewidth": 0.9,
            "color": "#0B67A3",
            "alpha": 0.8,
            "zorder": 999,
            "visible": True,
            "clip_on": False,
        }

    def _rotation_handle_point(self, ax, x: float, y: float) -> tuple[float, float]:
        try:
            px, py = ax.transData.transform((x, y))
            return tuple(ax.transData.inverted().transform((px, py + 28.0)))
        except Exception:
            return (x, y)

    def _text_rotation_handle_points(self, annotation: TextAnnotation) -> tuple[tuple[float, float], tuple[float, float]]:
        ax = self._axis_for(annotation)
        artist = self.artist_by_id.get(annotation.id)
        if ax is None or artist is None:
            base = (annotation.x, annotation.y)
            return base, base
        try:
            renderer = None
            if self.canvas is not None:
                try:
                    renderer = self.canvas.get_renderer()
                except Exception:
                    renderer = None
            if renderer is None:
                try:
                    renderer = artist.figure.canvas.get_renderer()
                except Exception:
                    renderer = None
            if renderer is not None:
                bbox = artist.get_window_extent(renderer=renderer)
                guide_display = (bbox.x0 + bbox.width / 2.0, bbox.y1)
                handle_display = (guide_display[0], guide_display[1] + 28.0)
                guide_data = tuple(ax.transData.inverted().transform(guide_display))
                handle_data = tuple(ax.transData.inverted().transform(handle_display))
                return guide_data, handle_data
        except Exception:
            pass
        base = (annotation.x, annotation.y)
        return base, self._rotation_handle_point(ax, annotation.x, annotation.y)

    def _show_handles_for_annotation(self, annotation: AnnotationType, *, primary: bool) -> None:
        ax = self._axis_for(annotation)
        if ax is None:
            return
        if isinstance(annotation, TextAnnotation):
            guide_start, handle_point = self._text_rotation_handle_points(annotation)
            if primary:
                guide = Line2D(
                    [guide_start[0], handle_point[0]],
                    [guide_start[1], handle_point[1]],
                    **self._guide_style(),
                )
                ax.add_line(guide)
                self.handle_roles[guide] = "guide"
                self.handle_artists.append(guide)
            handle = Line2D([handle_point[0]], [handle_point[1]], **self._handle_style("rotate" if primary else "multi"))
            ax.add_line(handle)
            self.handle_roles[handle] = "rotate" if primary else "multi"
            self.handle_artists.append(handle)
            return
        if isinstance(annotation, ArrowAnnotation):
            for role, x, y in (
                ("arrow_start", annotation.x1, annotation.y1),
                ("arrow_end", annotation.x2, annotation.y2),
            ):
                handle = Line2D([x], [y], **self._handle_style(role if primary else "multi"))
                ax.add_line(handle)
                self.handle_roles[handle] = role if primary else "multi"
                self.handle_artists.append(handle)
            return
        if isinstance(annotation, SegmentAnnotation):
            for role, x, y in (
                ("segment_start", annotation.x1, annotation.y1),
                ("segment_end", annotation.x2, annotation.y2),
            ):
                handle = Line2D([x], [y], **self._handle_style(role if primary else "multi"))
                ax.add_line(handle)
                self.handle_roles[handle] = role if primary else "multi"
                self.handle_artists.append(handle)

    def _show_handles_for_selected(self) -> None:
        self._remove_handles()
        try:
            selected = self.get_selected_annotations()
            for annotation in selected:
                self._show_handles_for_annotation(annotation, primary=(annotation.id == self.selected_id))
        except Exception as e:
            self._log_warn(f"Failed to render annotation handles: {e}")

    def _resolved_arrow_style(self, arrow_style: str) -> tuple[str, bool, bool]:
        style = str(arrow_style or "->").strip()
        start_circle = style.startswith("o")
        end_circle = style.endswith("o")
        if start_circle:
            style = style[1:]
        if end_circle:
            style = style[:-1]
        if not style:
            style = "-"
        return style, start_circle, end_circle

    def update_handles(self, *, redraw: bool = True) -> None:
        if not self.selected_id:
            return
        self._show_handles_for_selected()
        if redraw:
            self.draw_idle()

    @contextmanager
    def hidden_helpers(self):
        visibility = []
        for artist in list(self.handle_artists):
            try:
                visibility.append((artist, artist.get_visible()))
                artist.set_visible(False)
            except Exception:
                pass
        try:
            yield
        finally:
            for artist, was_visible in visibility:
                try:
                    artist.set_visible(was_visible)
                except Exception:
                    pass

    @contextmanager
    def hidden_annotations(self, annotation_ids):
        """Temporarily hide selected annotation artists during export."""
        visibility = []
        for annotation_id in annotation_ids or ():
            artist = self._primary_artist(self.artist_by_id.get(annotation_id))
            if artist is None:
                continue
            try:
                visibility.append((artist, artist.get_visible()))
                artist.set_visible(False)
            except Exception:
                pass
        try:
            yield
        finally:
            for artist, was_visible in visibility:
                try:
                    artist.set_visible(was_visible)
                except Exception:
                    pass

    @contextmanager
    def preserved_figure_display(self, *, dpi: float | None = None):
        if self.figure is None:
            yield
            return
        try:
            old_size = tuple(float(v) for v in self.figure.get_size_inches())
            old_dpi = float(self.figure.get_dpi())
            old_facecolor = self.figure.get_facecolor()
            axes_positions = [(ax, ax.get_position().frozen()) for ax in self.figure.axes]
        except Exception:
            old_size = None
            old_dpi = None
            old_facecolor = None
            axes_positions = []
        try:
            if old_size is not None:
                self.figure.set_size_inches(old_size[0], old_size[1], forward=False)
            if dpi is not None:
                self.figure.set_dpi(float(dpi))
            yield
        finally:
            try:
                if old_size is not None:
                    self.figure.set_size_inches(old_size[0], old_size[1], forward=False)
                if old_dpi is not None:
                    self.figure.set_dpi(old_dpi)
                if old_facecolor is not None:
                    self.figure.set_facecolor(old_facecolor)
                for ax, position in axes_positions:
                    try:
                        ax.set_position(position)
                    except Exception:
                        pass
            except Exception:
                pass

    def save_figure_without_helpers(self, path: str | Path, **kwargs: Any) -> None:
        if self.figure is None:
            return
        dpi = kwargs.get("dpi")
        excluded_annotation_ids = kwargs.pop("exclude_annotation_ids", ())
        with self.hidden_helpers(), self.hidden_annotations(excluded_annotation_ids), self.preserved_figure_display(dpi=dpi):
            # Keep annotations outside the axes (such as a large panel label
            # at y=1.02) inside the saved image.  Callers may still override
            # this explicitly when an exact canvas size is required.
            kwargs.setdefault("bbox_inches", "tight")
            kwargs.setdefault("pad_inches", 0.05)
            self.figure.savefig(path, **kwargs)

    def _event_in_managed_axes(self, event) -> bool:
        return event is not None and event.inaxes in self.axes.values() and event.xdata is not None and event.ydata is not None

    def _event_data_for_axis(self, ax, event) -> tuple[float, float] | None:
        if ax is None or event is None:
            return None
        if event.inaxes is ax and event.xdata is not None and event.ydata is not None:
            return (float(event.xdata), float(event.ydata))
        try:
            return tuple(float(v) for v in ax.transData.inverted().transform((float(event.x), float(event.y))))
        except Exception:
            return None

    def _event_data_for_annotation(self, annotation: AnnotationType, event) -> tuple[float, float] | None:
        ax = self._axis_for(annotation)
        if (
            isinstance(annotation, TextAnnotation)
            and ax is not None
            and getattr(annotation, "coordinate_system", "data") == "axes_fraction"
        ):
            try:
                return tuple(float(v) for v in ax.transAxes.inverted().transform((float(event.x), float(event.y))))
            except Exception:
                return None
        return self._event_data_for_axis(self._axis_for(annotation), event)

    def _hit_handle(self, event) -> str | None:
        for handle in reversed(self.handle_artists):
            role = self.handle_roles.get(handle)
            if role in {"guide", "multi"}:
                continue
            try:
                contains, _details = handle.contains(event)
            except Exception:
                contains = False
            if contains:
                return role
            try:
                xdata = float(handle.get_xdata()[0])
                ydata = float(handle.get_ydata()[0])
                ax = handle.axes
                hx, hy = ax.transData.transform((xdata, ydata))
                if math.hypot(float(event.x) - hx, float(event.y) - hy) <= 12.0:
                    return role
            except Exception:
                pass
        return None

    def _hit_text_annotation(self, event) -> str | None:
        candidates: list[tuple[float, int, str]] = []
        order_by_id = {item.id: index for index, item in enumerate(self.annotations.items)}
        for annotation_id, artist in self.artist_by_id.items():
            annotation = self.annotations.get(annotation_id)
            if not isinstance(annotation, TextAnnotation) or not annotation.visible:
                continue
            artist = self._primary_artist(artist)
            if artist is None:
                continue
            try:
                contains, _details = artist.contains(event)
            except Exception:
                contains = False
            if not contains:
                try:
                    renderer = self.canvas.get_renderer() if self.canvas is not None else None
                    bbox = artist.get_window_extent(renderer=renderer).expanded(1.12, 1.35)
                    contains = bbox.contains(event.x, event.y)
                except Exception:
                    contains = False
            if contains:
                candidates.append((float(annotation.zorder), order_by_id.get(annotation_id, 0), annotation_id))
        if not candidates:
            return None
        candidates.sort()
        return candidates[-1][2]

    def _point_to_segment_distance_px(self, px: float, py: float, ax: Any, x1: float, y1: float, x2: float, y2: float) -> float:
        try:
            x1p, y1p = ax.transData.transform((x1, y1))
            x2p, y2p = ax.transData.transform((x2, y2))
            dx = x2p - x1p
            dy = y2p - y1p
            denom = dx * dx + dy * dy
            if denom <= 1.0e-12:
                return math.hypot(px - x1p, py - y1p)
            t = max(0.0, min(1.0, ((px - x1p) * dx + (py - y1p) * dy) / denom))
            cx = x1p + t * dx
            cy = y1p + t * dy
            return math.hypot(px - cx, py - cy)
        except Exception:
            return float("inf")

    def _annotation_bounds(self, annotation: AnnotationType) -> tuple[float, float, float, float] | None:
        if isinstance(annotation, TextAnnotation):
            ax = self._axis_for(annotation)
            artist = self._primary_artist(self.artist_by_id.get(annotation.id))
            if ax is not None and artist is not None:
                try:
                    renderer = self.canvas.get_renderer() if self.canvas is not None else artist.figure.canvas.get_renderer()
                    bbox = artist.get_window_extent(renderer=renderer)
                    p0 = ax.transData.inverted().transform((bbox.x0, bbox.y0))
                    p1 = ax.transData.inverted().transform((bbox.x1, bbox.y1))
                    return (min(float(p0[0]), float(p1[0])), min(float(p0[1]), float(p1[1])),
                            max(float(p0[0]), float(p1[0])), max(float(p0[1]), float(p1[1])))
                except Exception:
                    pass
            return (annotation.x, annotation.y, annotation.x, annotation.y)
        if isinstance(annotation, (ArrowAnnotation, SegmentAnnotation)):
            return (
                min(annotation.x1, annotation.x2),
                min(annotation.y1, annotation.y2),
                max(annotation.x1, annotation.x2),
                max(annotation.y1, annotation.y2),
            )
        return None

    def _offset_annotation(self, annotation: AnnotationType, dx: float, dy: float) -> None:
        if isinstance(annotation, TextAnnotation):
            annotation.x += dx
            annotation.y += dy
        elif isinstance(annotation, (ArrowAnnotation, SegmentAnnotation)):
            annotation.x1 += dx
            annotation.x2 += dx
            annotation.y1 += dy
            annotation.y2 += dy
        self._update_annotation_artist(annotation)

    def _selected_with_bounds(self) -> list[tuple[AnnotationType, tuple[float, float, float, float]]]:
        items: list[tuple[AnnotationType, tuple[float, float, float, float]]] = []
        for annotation in self.get_selected_annotations():
            if annotation.locked:
                continue
            bounds = self._annotation_bounds(annotation)
            if bounds is not None:
                items.append((annotation, bounds))
        return items

    def align_selected(self, operation: str) -> bool:
        valid_operations = {
            "left",
            "center_h",
            "right",
            "top",
            "center_v",
            "bottom",
            "distribute_h",
            "distribute_v",
        }
        op = str(operation)
        if op not in valid_operations:
            return False
        items = self._selected_with_bounds()
        if len(items) < 2:
            return False
        if op in {"distribute_h", "distribute_v"} and len(items) < 3:
            return False
        self._notify_before_change()
        if op == "left":
            target = min(bounds[0] for _annotation, bounds in items)
            for annotation, bounds in items:
                self._offset_annotation(annotation, target - bounds[0], 0.0)
        elif op == "center_h":
            target = (min(bounds[0] for _annotation, bounds in items) + max(bounds[2] for _annotation, bounds in items)) / 2.0
            for annotation, bounds in items:
                self._offset_annotation(annotation, target - ((bounds[0] + bounds[2]) / 2.0), 0.0)
        elif op == "right":
            target = max(bounds[2] for _annotation, bounds in items)
            for annotation, bounds in items:
                self._offset_annotation(annotation, target - bounds[2], 0.0)
        elif op == "top":
            target = max(bounds[3] for _annotation, bounds in items)
            for annotation, bounds in items:
                self._offset_annotation(annotation, 0.0, target - bounds[3])
        elif op == "center_v":
            target = (min(bounds[1] for _annotation, bounds in items) + max(bounds[3] for _annotation, bounds in items)) / 2.0
            for annotation, bounds in items:
                self._offset_annotation(annotation, 0.0, target - ((bounds[1] + bounds[3]) / 2.0))
        elif op == "bottom":
            target = min(bounds[1] for _annotation, bounds in items)
            for annotation, bounds in items:
                self._offset_annotation(annotation, 0.0, target - bounds[1])
        elif op == "distribute_h":
            ordered = sorted(items, key=lambda item: (item[1][0] + item[1][2]) / 2.0)
            centers = [((bounds[0] + bounds[2]) / 2.0) for _annotation, bounds in ordered]
            step = (centers[-1] - centers[0]) / (len(ordered) - 1)
            for index, (annotation, bounds) in enumerate(ordered[1:-1], start=1):
                self._offset_annotation(annotation, centers[0] + step * index - ((bounds[0] + bounds[2]) / 2.0), 0.0)
        elif op == "distribute_v":
            ordered = sorted(items, key=lambda item: (item[1][1] + item[1][3]) / 2.0)
            centers = [((bounds[1] + bounds[3]) / 2.0) for _annotation, bounds in ordered]
            step = (centers[-1] - centers[0]) / (len(ordered) - 1)
            for index, (annotation, bounds) in enumerate(ordered[1:-1], start=1):
                self._offset_annotation(annotation, 0.0, centers[0] + step * index - ((bounds[1] + bounds[3]) / 2.0))
        else:
            return False
        self.update_handles(redraw=False)
        self.draw_idle()
        self._notify_change()
        self._notify_selection_change()
        return True

    def _annotation_display_bounds(self, annotation: AnnotationType) -> tuple[float, float, float, float] | None:
        ax = self._axis_for(annotation)
        if ax is None:
            return None
        if isinstance(annotation, TextAnnotation):
            artist = self._primary_artist(self.artist_by_id.get(annotation.id))
            if artist is not None:
                try:
                    renderer = self.canvas.get_renderer() if self.canvas is not None else artist.figure.canvas.get_renderer()
                    bbox = artist.get_window_extent(renderer=renderer)
                    return (float(bbox.x0), float(bbox.y0), float(bbox.x1), float(bbox.y1))
                except Exception:
                    pass
            try:
                x, y = ax.transData.transform((annotation.x, annotation.y))
                return (float(x), float(y), float(x), float(y))
            except Exception:
                return None
        if isinstance(annotation, (ArrowAnnotation, SegmentAnnotation)):
            try:
                p0 = ax.transData.transform((annotation.x1, annotation.y1))
                p1 = ax.transData.transform((annotation.x2, annotation.y2))
                return (
                    min(float(p0[0]), float(p1[0])),
                    min(float(p0[1]), float(p1[1])),
                    max(float(p0[0]), float(p1[0])),
                    max(float(p0[1]), float(p1[1])),
                )
            except Exception:
                return None
        return None

    def _begin_range_select(self, event) -> None:
        if self.figure is None:
            return
        self._remove_range_select_artist()
        self.range_select_state = {
            "start": (float(event.x), float(event.y)),
            "end": (float(event.x), float(event.y)),
            "additive": self._event_has_multi_modifier(event),
        }
        try:
            self.range_select_artist = Rectangle(
                (0, 0),
                0,
                0,
                transform=self.figure.transFigure,
                fill=False,
                facecolor="none",
                edgecolor="#0B67A3",
                linewidth=1.0,
                linestyle="-",
                zorder=2000,
                visible=True,
                clip_on=False,
            )
            self.figure.patches.append(self.range_select_artist)
        except Exception:
            self.range_select_artist = None

    def _update_range_select(self, event) -> None:
        if self.range_select_state is None:
            return
        self.range_select_state["end"] = (float(event.x), float(event.y))
        if self.range_select_artist is None or self.figure is None:
            return
        try:
            start = self.range_select_state["start"]
            end = self.range_select_state["end"]
            fig_w, fig_h = self.figure.bbox.width, self.figure.bbox.height
            x0, x1 = sorted((float(start[0]), float(end[0])))
            y0, y1 = sorted((float(start[1]), float(end[1])))
            self.range_select_artist.set_bounds(x0 / fig_w, y0 / fig_h, (x1 - x0) / fig_w, (y1 - y0) / fig_h)
            self.draw_idle()
        except Exception:
            pass

    def _finish_range_select(self, event) -> None:
        if self.range_select_state is None:
            return
        state = self.range_select_state
        try:
            if event is not None:
                state["end"] = (float(event.x), float(event.y))
            start = state.get("start", state["end"])
            end = state["end"]
            additive = bool(state.get("additive", False))
            x0, x1 = sorted((float(start[0]), float(end[0])))
            y0, y1 = sorted((float(start[1]), float(end[1])))
            if abs(x1 - x0) < 3.0 and abs(y1 - y0) < 3.0:
                if not additive:
                    self.selected_id = None
                    self.selected_ids.clear()
                    self._remove_handles()
                    self._notify_selection_change()
                return
            selected: list[str] = []
            for annotation in self.annotations.items:
                if not isinstance(annotation, (TextAnnotation, ArrowAnnotation, SegmentAnnotation)):
                    continue
                bounds = self._annotation_display_bounds(annotation)
                if bounds is None:
                    continue
                bx0, by0, bx1, by1 = bounds
                if bx0 >= x0 and bx1 <= x1 and by0 >= y0 and by1 <= y1:
                    selected.append(annotation.id)
            self.select_many(selected, additive=additive, redraw=False)
        finally:
            self.range_select_state = None
            self._remove_range_select_artist()
            self.draw_idle()

    def _hit_arrow_annotation(self, event) -> str | None:
        candidates: list[tuple[float, int, str]] = []
        order_by_id = {item.id: index for index, item in enumerate(self.annotations.items)}
        for annotation_id, artist in self.artist_by_id.items():
            annotation = self.annotations.get(annotation_id)
            if not isinstance(annotation, ArrowAnnotation) or not annotation.visible:
                continue
            artist = self._primary_artist(artist)
            if artist is None:
                continue
            contains = False
            try:
                contains, _details = artist.contains(event)
            except Exception:
                contains = False
            ax = self._axis_for(annotation)
            distance = float("inf")
            if ax is not None:
                distance = self._point_to_segment_distance_px(
                    float(event.x),
                    float(event.y),
                    ax,
                    annotation.x1,
                    annotation.y1,
                    annotation.x2,
                    annotation.y2,
                )
            if contains or distance <= 10.0:
                candidates.append((float(annotation.zorder), order_by_id.get(annotation_id, 0), annotation_id))
        if not candidates:
            return None
        candidates.sort()
        return candidates[-1][2]

    def _hit_segment_annotation(self, event) -> str | None:
        candidates: list[tuple[float, int, str]] = []
        order_by_id = {item.id: index for index, item in enumerate(self.annotations.items)}
        for annotation_id, artist in self.artist_by_id.items():
            annotation = self.annotations.get(annotation_id)
            if not isinstance(annotation, SegmentAnnotation) or not annotation.visible:
                continue
            artist = self._primary_artist(artist)
            if artist is None:
                continue
            contains = False
            try:
                contains, _details = artist.contains(event)
            except Exception:
                contains = False
            ax = self._axis_for(annotation)
            distance = float("inf")
            if ax is not None:
                distance = self._point_to_segment_distance_px(
                    float(event.x),
                    float(event.y),
                    ax,
                    annotation.x1,
                    annotation.y1,
                    annotation.x2,
                    annotation.y2,
                )
            if contains or distance <= 8.0:
                candidates.append((float(annotation.zorder), order_by_id.get(annotation_id, 0), annotation_id))
        if not candidates:
            return None
        candidates.sort()
        return candidates[-1][2]

    def _hit_annotation(self, event) -> str | None:
        candidates = [
            annotation_id
            for annotation_id in (
                self._hit_arrow_annotation(event),
                self._hit_segment_annotation(event),
                self._hit_text_annotation(event),
            )
            if annotation_id is not None
        ]
        if not candidates:
            return None
        order_by_id = {item.id: index for index, item in enumerate(self.annotations.items)}
        candidates.sort(
            key=lambda annotation_id: (
                float(getattr(self.annotations.get(annotation_id), "zorder", 0.0)),
                order_by_id.get(annotation_id, 0),
            )
        )
        return candidates[-1]

    def _event_has_ctrl(self, event) -> bool:
        key = str(getattr(event, "key", "") or "").lower()
        return "control" in key or key.startswith("ctrl") or "cmd" in key or "super" in key

    def _event_has_multi_modifier(self, event) -> bool:
        key = str(getattr(event, "key", "") or "").lower()
        return self._event_has_ctrl(event) or "shift" in key or bool(self._shift_pressed)

    def _add_text_at_event(self, event) -> None:
        if not self._event_in_managed_axes(event):
            return
        self._notify_before_change()
        annotation = self.annotations.add(TextAnnotation(x=float(event.xdata), y=float(event.ydata)))
        self.refresh_annotation(annotation.id)
        self.select(annotation.id)
        self.mode = "normal"
        self._sync_cursor()
        self._notify_mode_change()
        self._notify_change()

    def _snap_point_from_anchor(self, anchor_x: float, anchor_y: float, x: float, y: float) -> tuple[float, float]:
        dx = float(x) - float(anchor_x)
        dy = float(y) - float(anchor_y)
        length = math.hypot(dx, dy)
        if length <= 1.0e-12:
            return float(x), float(y)
        angle = math.atan2(dy, dx)
        snapped = round(math.degrees(angle) / 15.0) * 15.0
        snapped_rad = math.radians(snapped)
        return float(anchor_x + math.cos(snapped_rad) * length), float(anchor_y + math.sin(snapped_rad) * length)

    def _drag_too_short(self, event, state: dict[str, Any]) -> bool:
        try:
            return math.hypot(float(event.x) - float(state["start_px"]), float(event.y) - float(state["start_py"])) < 6.0
        except Exception:
            return True

    def _begin_arrow_creation(self, event) -> None:
        if not self._event_in_managed_axes(event):
            return
        self._notify_before_change()
        annotation = self.annotations.add(
            ArrowAnnotation(
                x1=float(event.xdata),
                y1=float(event.ydata),
                x2=float(event.xdata),
                y2=float(event.ydata),
                arrow_style=self._pending_arrow_style,
            )
        )
        self._creating_arrow_id = annotation.id
        self.refresh_annotation(annotation.id)
        self.select(annotation.id)
        self.drag_state = {
            "id": annotation.id,
            "role": "create_arrow",
            "start_x": annotation.x1,
            "start_y": annotation.y1,
            "start_px": float(event.x),
            "start_py": float(event.y),
        }
        self._sync_cursor("crosshair")

    def _begin_segment_creation(self, event) -> None:
        if not self._event_in_managed_axes(event):
            return
        self._notify_before_change()
        annotation = self.annotations.add(
            SegmentAnnotation(
                x1=float(event.xdata),
                y1=float(event.ydata),
                x2=float(event.xdata),
                y2=float(event.ydata),
            )
        )
        self._creating_segment_id = annotation.id
        self.refresh_annotation(annotation.id)
        self.select(annotation.id)
        self.drag_state = {
            "id": annotation.id,
            "role": "create_segment",
            "start_x": annotation.x1,
            "start_y": annotation.y1,
            "start_px": float(event.x),
            "start_py": float(event.y),
        }
        self._sync_cursor("crosshair")

    def _cancel_current_arrow(self) -> None:
        self._cancel_arrow_creation()
        self.mode = "normal"
        self._sync_cursor()
        self._notify_mode_change()
        self.draw_idle()

    def _cancel_current_segment(self) -> None:
        self._cancel_segment_creation()
        self.mode = "normal"
        self._sync_cursor()
        self._notify_mode_change()
        self.draw_idle()

    def _begin_text_drag(self, annotation_id: str, event, role: str = "move") -> None:
        annotation = self.annotations.get(annotation_id)
        if not isinstance(annotation, TextAnnotation) or annotation.locked:
            return
        event_data = self._event_data_for_annotation(annotation, event)
        if event_data is None:
            return
        self._notify_before_change()
        self.select(annotation_id)
        self.drag_state = {
            "id": annotation_id,
            "role": role,
            "start_xdata": event_data[0],
            "start_ydata": event_data[1],
            "start_x": annotation.x,
            "start_y": annotation.y,
            "start_rotation": annotation.rotation,
        }
        self._sync_cursor("fleur" if role == "move" else "exchange")

    def _begin_arrow_drag(self, annotation_id: str, event, role: str = "arrow_move") -> None:
        annotation = self.annotations.get(annotation_id)
        if not isinstance(annotation, ArrowAnnotation) or annotation.locked:
            return
        event_data = self._event_data_for_annotation(annotation, event)
        if event_data is None:
            return
        self._notify_before_change()
        self.select(annotation_id)
        self.drag_state = {
            "id": annotation_id,
            "role": role,
            "start_xdata": event_data[0],
            "start_ydata": event_data[1],
            "start_x1": annotation.x1,
            "start_y1": annotation.y1,
            "start_x2": annotation.x2,
            "start_y2": annotation.y2,
        }
        self._sync_cursor("fleur" if role == "arrow_move" else "hand2")

    def _begin_segment_drag(self, annotation_id: str, event, role: str = "segment_move") -> None:
        annotation = self.annotations.get(annotation_id)
        if not isinstance(annotation, SegmentAnnotation) or annotation.locked:
            return
        event_data = self._event_data_for_annotation(annotation, event)
        if event_data is None:
            return
        self._notify_before_change()
        self.select(annotation_id)
        self.drag_state = {
            "id": annotation_id,
            "role": role,
            "start_xdata": event_data[0],
            "start_ydata": event_data[1],
            "start_x1": annotation.x1,
            "start_y1": annotation.y1,
            "start_x2": annotation.x2,
            "start_y2": annotation.y2,
        }
        self._sync_cursor("fleur" if role == "segment_move" else "hand2")

    def _begin_multi_drag(self, anchor_id: str, event) -> None:
        anchor = self.annotations.get(anchor_id)
        if not isinstance(anchor, (TextAnnotation, ArrowAnnotation, SegmentAnnotation)):
            return
        event_data = self._event_data_for_annotation(anchor, event)
        if event_data is None:
            return
        selected = [item for item in self.get_selected_annotations() if not item.locked]
        if len(selected) <= 1:
            return
        self._notify_before_change()
        starts: dict[str, dict[str, float]] = {}
        for item in selected:
            if isinstance(item, TextAnnotation):
                starts[item.id] = {"x": item.x, "y": item.y}
            elif isinstance(item, (ArrowAnnotation, SegmentAnnotation)):
                starts[item.id] = {"x1": item.x1, "y1": item.y1, "x2": item.x2, "y2": item.y2}
        self.drag_state = {
            "id": anchor_id,
            "role": "multi_move",
            "start_xdata": event_data[0],
            "start_ydata": event_data[1],
            "starts": starts,
        }
        self._sync_cursor("fleur")

    def _move_annotation_by_delta(self, annotation: AnnotationType, start: dict[str, float], dx: float, dy: float) -> None:
        if isinstance(annotation, TextAnnotation):
            annotation.x = float(start["x"] + dx)
            annotation.y = float(start["y"] + dy)
        elif isinstance(annotation, (ArrowAnnotation, SegmentAnnotation)):
            annotation.x1 = float(start["x1"] + dx)
            annotation.y1 = float(start["y1"] + dy)
            annotation.x2 = float(start["x2"] + dx)
            annotation.y2 = float(start["y2"] + dy)
        self._update_annotation_artist(annotation)

    def _drag_multi(self, event) -> None:
        state = self.drag_state
        if not state:
            return
        anchor = self.annotations.get(str(state.get("id", "")))
        if not isinstance(anchor, (TextAnnotation, ArrowAnnotation, SegmentAnnotation)):
            return
        event_data = self._event_data_for_annotation(anchor, event)
        if event_data is None:
            return
        dx = event_data[0] - float(state["start_xdata"])
        dy = event_data[1] - float(state["start_ydata"])
        starts = state.get("starts", {})
        if not isinstance(starts, dict):
            return
        for annotation_id, start in starts.items():
            annotation = self.annotations.get(str(annotation_id))
            if isinstance(annotation, (TextAnnotation, ArrowAnnotation, SegmentAnnotation)) and isinstance(start, dict):
                self._move_annotation_by_delta(annotation, start, dx, dy)
        self.update_handles(redraw=False)
        self.draw_idle()
        self._notify_selection_change()

    def _drag_arrow(self, event) -> None:
        state = self.drag_state
        if not state:
            return
        annotation = self.annotations.get(state["id"])
        if not isinstance(annotation, ArrowAnnotation):
            return
        role = state.get("role")
        event_data = self._event_data_for_annotation(annotation, event)
        if event_data is None:
            return
        if role == "create_arrow":
            x2, y2 = event_data
            if self._shift_pressed or str(getattr(event, "key", "")).lower() == "shift":
                x2, y2 = self._snap_point_from_anchor(annotation.x1, annotation.y1, x2, y2)
            annotation.x2 = x2
            annotation.y2 = y2
        elif role == "arrow_move":
            dx = event_data[0] - float(state["start_xdata"])
            dy = event_data[1] - float(state["start_ydata"])
            annotation.x1 = float(state["start_x1"] + dx)
            annotation.y1 = float(state["start_y1"] + dy)
            annotation.x2 = float(state["start_x2"] + dx)
            annotation.y2 = float(state["start_y2"] + dy)
        elif role == "arrow_start":
            x1, y1 = event_data
            if self._shift_pressed or str(getattr(event, "key", "")).lower() == "shift":
                x1, y1 = self._snap_point_from_anchor(annotation.x2, annotation.y2, x1, y1)
            annotation.x1 = x1
            annotation.y1 = y1
        elif role == "arrow_end":
            x2, y2 = event_data
            if self._shift_pressed or str(getattr(event, "key", "")).lower() == "shift":
                x2, y2 = self._snap_point_from_anchor(annotation.x1, annotation.y1, x2, y2)
            annotation.x2 = x2
            annotation.y2 = y2
        self._update_arrow_artist(annotation)
        self.update_handles(redraw=False)
        self.draw_idle()
        self._notify_selection_change()

    def _drag_segment(self, event) -> None:
        state = self.drag_state
        if not state:
            return
        annotation = self.annotations.get(state["id"])
        if not isinstance(annotation, SegmentAnnotation):
            return
        role = state.get("role")
        event_data = self._event_data_for_annotation(annotation, event)
        if event_data is None:
            return
        if role == "create_segment":
            x2, y2 = event_data
            if self._shift_pressed or str(getattr(event, "key", "")).lower() == "shift":
                x2, y2 = self._snap_point_from_anchor(annotation.x1, annotation.y1, x2, y2)
            annotation.x2 = x2
            annotation.y2 = y2
        elif role == "segment_move":
            dx = event_data[0] - float(state["start_xdata"])
            dy = event_data[1] - float(state["start_ydata"])
            annotation.x1 = float(state["start_x1"] + dx)
            annotation.y1 = float(state["start_y1"] + dy)
            annotation.x2 = float(state["start_x2"] + dx)
            annotation.y2 = float(state["start_y2"] + dy)
        elif role == "segment_start":
            x1, y1 = event_data
            if self._shift_pressed or str(getattr(event, "key", "")).lower() == "shift":
                x1, y1 = self._snap_point_from_anchor(annotation.x2, annotation.y2, x1, y1)
            annotation.x1 = x1
            annotation.y1 = y1
        elif role == "segment_end":
            x2, y2 = event_data
            if self._shift_pressed or str(getattr(event, "key", "")).lower() == "shift":
                x2, y2 = self._snap_point_from_anchor(annotation.x1, annotation.y1, x2, y2)
            annotation.x2 = x2
            annotation.y2 = y2
        self._update_segment_artist(annotation)
        self.update_handles(redraw=False)
        self.draw_idle()
        self._notify_selection_change()

    def _drag_text(self, event) -> None:
        state = self.drag_state
        if not state:
            return
        annotation = self.annotations.get(state["id"])
        if not isinstance(annotation, TextAnnotation):
            return
        ax = self._axis_for(annotation)
        if ax is None:
            return
        role = state.get("role")
        if role == "move":
            event_data = self._event_data_for_annotation(annotation, event)
            if event_data is None:
                return
            annotation.x = float(state["start_x"] + (event_data[0] - state["start_xdata"]))
            annotation.y = float(state["start_y"] + (event_data[1] - state["start_ydata"]))
        elif role == "rotate":
            try:
                anchor_x, anchor_y = ax.transData.transform((annotation.x, annotation.y))
                angle = math.degrees(math.atan2(event.y - anchor_y, event.x - anchor_x))
                if self._shift_pressed or str(getattr(event, "key", "")).lower() == "shift":
                    angle = round(angle / 15.0) * 15.0
                annotation.rotation = float(angle)
            except Exception:
                return
        self._update_text_artist(annotation)
        self.update_handles(redraw=False)
        self.draw_idle()
        self._notify_selection_change()

    def _finish_drag(self, event=None) -> None:
        if self.drag_state is None:
            return
        state = self.drag_state
        if state.get("role") == "create_arrow":
            annotation_id = str(state.get("id", ""))
            if event is None or self._drag_too_short(event, state):
                self._cancel_current_arrow()
                return
            self._creating_arrow_id = None
            self.mode = "normal"
            self.select(annotation_id)
            self._sync_cursor()
            self._notify_mode_change()
            self.drag_state = None
            self.update_handles(redraw=True)
            self._notify_change()
            return
        if state.get("role") == "create_segment":
            annotation_id = str(state.get("id", ""))
            if event is None or self._drag_too_short(event, state):
                self._cancel_current_segment()
                return
            self._creating_segment_id = None
            self.mode = "normal"
            self.select(annotation_id)
            self._sync_cursor()
            self._notify_mode_change()
            self.drag_state = None
            self.update_handles(redraw=True)
            self._notify_change()
            return
        self.drag_state = None
        self._sync_cursor()
        self.update_handles(redraw=True)
        self._notify_change()

    def _edit_text_annotation(self, annotation_id: str) -> None:
        annotation = self.annotations.get(annotation_id)
        if not isinstance(annotation, TextAnnotation) or self.text_editor is None:
            return
        try:
            new_text = self.text_editor(annotation.text)
        except Exception:
            new_text = None
        if new_text is None or str(new_text) == annotation.text:
            return
        self._notify_before_change()
        annotation.text = str(new_text)
        self._update_text_artist(annotation)
        self.select(annotation.id)
        self._notify_change()
        self._notify_selection_change()
        self.draw_idle()

    def _delete_selected_annotation(self) -> None:
        annotations = [item for item in self.get_selected_annotations() if not item.locked]
        if not annotations:
            return
        self._notify_before_change()
        for annotation in annotations:
            self.annotations.remove(annotation.id)
            self.remove_artist(annotation.id)
        self.selected_id = None
        self.selected_ids.clear()
        self._notify_change()
        self._notify_selection_change()
        self.draw_idle()

    def _on_button_press(self, event) -> None:
        if event is None:
            return
        if getattr(event, "_plotlauncher_legend_handled", False):
            return
        if getattr(event, "_plotlauncher_axis_popup_handled", False):
            return
        if getattr(event, "_plotlauncher_series_popup_handled", False):
            return
        widget = self._tk_widget()
        if widget is not None:
            try:
                widget.focus_set()
            except Exception:
                pass
        button = getattr(event, "button", None)
        if button == 3:
            self.cancel_text_mode()
            self.cancel_arrow_mode()
            self.cancel_segment_mode()
            return
        if button != 1:
            return
        if self._toolbar_active():
            return
        if self.mode == "add_arrow":
            self._begin_arrow_creation(event)
            return
        if self.mode == "add_segment":
            self._begin_segment_creation(event)
            return
        if self.mode == "add_text":
            self._add_text_at_event(event)
            return
        if getattr(event, "dblclick", False):
            hit_id = self._hit_annotation(event)
            if hit_id is not None:
                annotation = self.annotations.get(hit_id)
                self.select(hit_id)
                self._notify_activate(annotation)
            return
        role = self._hit_handle(event)
        if role is not None and self.selected_id:
            if role in {"arrow_start", "arrow_end"}:
                self._begin_arrow_drag(self.selected_id, event, role=role)
            elif role in {"segment_start", "segment_end"}:
                self._begin_segment_drag(self.selected_id, event, role=role)
            else:
                self._begin_text_drag(self.selected_id, event, role=role)
            return
        hit_id = self._hit_annotation(event)
        if hit_id is not None:
            if self._event_has_multi_modifier(event):
                self.toggle_selection(hit_id)
                return
            if hit_id not in self.selected_ids:
                self.select(hit_id)
            annotation = self.annotations.get(hit_id)
            if len(self.selected_ids) > 1:
                self._begin_multi_drag(hit_id, event)
            elif isinstance(annotation, ArrowAnnotation):
                self._begin_arrow_drag(hit_id, event, role="arrow_move")
            elif isinstance(annotation, SegmentAnnotation):
                self._begin_segment_drag(hit_id, event, role="segment_move")
            else:
                self._begin_text_drag(hit_id, event, role="move")
            return
        if not getattr(event, "dblclick", False):
            self._begin_range_select(event)

    def _on_motion(self, event) -> None:
        if event is not None and getattr(event, "_plotlauncher_legend_handled", False):
            return
        if event is not None and getattr(event, "_plotlauncher_axis_popup_handled", False):
            return
        if event is not None and getattr(event, "_plotlauncher_series_popup_handled", False):
            return
        if self.range_select_state is not None:
            self._update_range_select(event)
            return
        if self.drag_state is not None:
            role = self.drag_state.get("role")
            if role == "multi_move":
                self._drag_multi(event)
            elif role in {"create_arrow", "arrow_move", "arrow_start", "arrow_end"}:
                self._drag_arrow(event)
            elif role in {"create_segment", "segment_move", "segment_start", "segment_end"}:
                self._drag_segment(event)
            else:
                self._drag_text(event)
            return
        if self.mode in {"add_text", "add_arrow", "add_segment"}:
            self._sync_cursor("crosshair")
            return
        if self._toolbar_active():
            return
        try:
            handle_role = self._hit_handle(event)
            if handle_role in {"rotate", "arrow_start", "arrow_end", "segment_start", "segment_end"}:
                self._sync_cursor("hand2")
            elif self._hit_annotation(event) is not None:
                self._sync_cursor("fleur")
            else:
                self._sync_cursor("")
        except Exception:
            self._sync_cursor("")

    def _on_button_release(self, event) -> None:
        if event is not None and getattr(event, "_plotlauncher_legend_handled", False):
            return
        if event is not None and getattr(event, "_plotlauncher_axis_popup_handled", False):
            return
        if event is not None and getattr(event, "_plotlauncher_series_popup_handled", False):
            return
        if self.range_select_state is not None:
            self._finish_range_select(event)
            return
        self._finish_drag(event)

    def _on_figure_leave(self, _event) -> None:
        if self.range_select_state is None:
            return
        self.range_select_state = None
        self._remove_range_select_artist()
        self.draw_idle()

    def _on_key_press(self, event) -> None:
        widget = self._tk_widget()
        try:
            focused = widget.focus_get() if widget is not None else None
            widget_class = focused.winfo_class() if focused is not None else ""
            if widget_class in {"Entry", "TEntry", "Spinbox", "TSpinbox", "TCombobox", "Text"}:
                return
        except Exception:
            pass
        key = str(getattr(event, "key", "")).lower()
        if key == "shift":
            self._shift_pressed = True
            return
        if key in {"ctrl+c", "control+c", "cmd+c", "super+c", "ctrl+insert", "control+insert"}:
            self.copy_selected_annotation()
            return
        if key in {"ctrl+v", "control+v", "cmd+v", "super+v", "shift+insert"}:
            self.paste_annotation()
            return
        if key == "escape":
            if self.range_select_state is not None:
                self.range_select_state = None
                self._remove_range_select_artist()
                self.draw_idle()
                return
            if self.mode == "add_text":
                self.cancel_text_mode()
            elif self.mode == "add_arrow" or self._creating_arrow_id is not None:
                self.cancel_arrow_mode()
            elif self.mode == "add_segment" or self._creating_segment_id is not None:
                self.cancel_segment_mode()
            else:
                self.clear_selection()
            return
        if key in {"delete", "backspace"}:
            self._delete_selected_annotation()

    def _on_key_release(self, event) -> None:
        key = str(getattr(event, "key", "")).lower()
        if key == "shift":
            self._shift_pressed = False


def render_annotations_to_figure(
    figure,
    axes,
    annotations: AnnotationCollection,
    path: str | Path,
    *,
    logger=None,
    **savefig_kwargs: Any,
) -> None:
    manager = AnnotationManager(annotations, logger=logger)
    manager.attach(figure, axes, canvas=None)
    try:
        manager.save_figure_without_helpers(path, **savefig_kwargs)
    finally:
        manager.detach()
