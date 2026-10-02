from __future__ import annotations

from copy import deepcopy
from dataclasses import asdict, dataclass, field
from typing import Any
from uuid import uuid4


ANNOTATION_TYPES = {"text", "arrow", "segment"}
ANNOTATION_COORDINATE_SYSTEMS = {"data", "axes_fraction"}


def generate_annotation_id(prefix: str = "annotation") -> str:
    return f"{prefix}_{uuid4().hex}"


def _coerce_float(value: Any, default: float, *, minimum: float | None = None, maximum: float | None = None) -> float:
    try:
        result = float(value)
    except Exception:
        result = default
    if minimum is not None:
        result = max(minimum, result)
    if maximum is not None:
        result = min(maximum, result)
    return result


def _coerce_bool(value: Any, default: bool = False) -> bool:
    if isinstance(value, bool):
        return value
    if isinstance(value, str):
        lowered = value.strip().lower()
        if lowered in {"1", "true", "yes", "on"}:
            return True
        if lowered in {"0", "false", "no", "off"}:
            return False
    return default


def _coerce_text(value: Any, default: str) -> str:
    if value is None:
        return default
    return str(value)


@dataclass
class AnnotationBase:
    id: str = field(default_factory=generate_annotation_id)
    type: str = ""
    axes_id: str = "primary"
    coordinate_system: str = "data"
    visible: bool = True
    locked: bool = False
    zorder: float = 20.0

    def validate_common(self) -> None:
        if not self.id:
            self.id = generate_annotation_id(self.type or "annotation")
        if self.coordinate_system not in ANNOTATION_COORDINATE_SYSTEMS:
            self.coordinate_system = "data"
        if not self.axes_id:
            self.axes_id = "primary"
        self.visible = bool(self.visible)
        self.locked = bool(self.locked)
        self.zorder = _coerce_float(self.zorder, 20.0)

    def to_dict(self) -> dict[str, Any]:
        return deepcopy(asdict(self))


@dataclass
class TextAnnotation(AnnotationBase):
    type: str = "text"
    x: float = 0.0
    y: float = 0.0
    text: str = "Text"
    rotation: float = 0.0
    font_size: float = 7.0
    color: str = "#222222"
    opacity: float = 1.0
    font_weight: str = "normal"
    font_style: str = "normal"
    font_family: str = "Arial"
    bold: bool = False
    italic: bool = False
    horizontal_alignment: str = "left"
    vertical_alignment: str = "baseline"

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "TextAnnotation":
        font_weight = _coerce_text(data.get("font_weight"), "normal")
        font_style = _coerce_text(data.get("font_style"), "normal")
        bold = _coerce_bool(data.get("bold"), str(font_weight).lower() == "bold")
        italic = _coerce_bool(data.get("italic"), str(font_style).lower() == "italic")
        item = cls(
            id=_coerce_text(data.get("id"), generate_annotation_id("text")),
            axes_id=_coerce_text(data.get("axes_id"), "primary"),
            coordinate_system=_coerce_text(data.get("coordinate_system"), "data"),
            visible=_coerce_bool(data.get("visible"), True),
            locked=_coerce_bool(data.get("locked"), False),
            zorder=_coerce_float(data.get("zorder"), 20.0),
            x=_coerce_float(data.get("x"), 0.0),
            y=_coerce_float(data.get("y"), 0.0),
            text=_coerce_text(data.get("text"), "Text"),
            rotation=_coerce_float(data.get("rotation"), 0.0),
            font_size=_coerce_float(data.get("font_size"), 7.0, minimum=1.0),
            color=_coerce_text(data.get("color"), "#222222"),
            opacity=_coerce_float(data.get("opacity"), 1.0, minimum=0.0, maximum=1.0),
            font_weight="bold" if bold else font_weight,
            font_style="italic" if italic else font_style,
            font_family=_coerce_text(data.get("font_family"), "Arial"),
            bold=bold,
            italic=italic,
            horizontal_alignment=_coerce_text(data.get("horizontal_alignment"), "left"),
            vertical_alignment=_coerce_text(data.get("vertical_alignment"), "baseline"),
        )
        item.validate_common()
        item.type = "text"
        return item


@dataclass
class ArrowAnnotation(AnnotationBase):
    type: str = "arrow"
    x1: float = 0.0
    y1: float = 0.0
    x2: float = 1.0
    y2: float = 1.0
    color: str = "#000000"
    opacity: float = 1.0
    line_width: float = 0.5
    line_style: str = "-"
    arrow_style: str = "->"
    arrow_size: float = 7.0

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "ArrowAnnotation":
        item = cls(
            id=_coerce_text(data.get("id"), generate_annotation_id("arrow")),
            axes_id=_coerce_text(data.get("axes_id"), "primary"),
            coordinate_system=_coerce_text(data.get("coordinate_system"), "data"),
            visible=_coerce_bool(data.get("visible"), True),
            locked=_coerce_bool(data.get("locked"), False),
            zorder=_coerce_float(data.get("zorder"), 20.0),
            x1=_coerce_float(data.get("x1"), 0.0),
            y1=_coerce_float(data.get("y1"), 0.0),
            x2=_coerce_float(data.get("x2"), 1.0),
            y2=_coerce_float(data.get("y2"), 1.0),
            color=_coerce_text(data.get("color"), "#000000"),
            opacity=_coerce_float(data.get("opacity"), 1.0, minimum=0.0, maximum=1.0),
            line_width=_coerce_float(data.get("line_width"), 0.5, minimum=0.1),
            line_style=_coerce_text(data.get("line_style"), "-"),
            arrow_style=_coerce_text(data.get("arrow_style"), "->"),
            arrow_size=_coerce_float(data.get("arrow_size"), 7.0, minimum=1.0),
        )
        item.validate_common()
        item.type = "arrow"
        return item


@dataclass
class SegmentAnnotation(AnnotationBase):
    type: str = "segment"
    x1: float = 0.0
    y1: float = 0.0
    x2: float = 1.0
    y2: float = 1.0
    color: str = "#000000"
    opacity: float = 1.0
    line_width: float = 0.5
    line_style: str = "-"

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "SegmentAnnotation":
        item = cls(
            id=_coerce_text(data.get("id"), generate_annotation_id("segment")),
            axes_id=_coerce_text(data.get("axes_id"), "primary"),
            coordinate_system=_coerce_text(data.get("coordinate_system"), "data"),
            visible=_coerce_bool(data.get("visible"), True),
            locked=_coerce_bool(data.get("locked"), False),
            zorder=_coerce_float(data.get("zorder"), 20.0),
            x1=_coerce_float(data.get("x1"), 0.0),
            y1=_coerce_float(data.get("y1"), 0.0),
            x2=_coerce_float(data.get("x2"), 1.0),
            y2=_coerce_float(data.get("y2"), 1.0),
            color=_coerce_text(data.get("color"), "#000000"),
            opacity=_coerce_float(data.get("opacity"), 1.0, minimum=0.0, maximum=1.0),
            line_width=_coerce_float(data.get("line_width"), 0.5, minimum=0.1),
            line_style=_coerce_text(data.get("line_style"), "-"),
        )
        item.validate_common()
        item.type = "segment"
        return item


AnnotationType = TextAnnotation | ArrowAnnotation | SegmentAnnotation


def annotation_to_dict(annotation: AnnotationType) -> dict[str, Any]:
    return annotation.to_dict()


def annotation_from_dict(data: Any) -> AnnotationType | None:
    if not isinstance(data, dict):
        return None
    annotation_type = str(data.get("type", "")).strip().lower()
    try:
        if annotation_type == "text":
            return TextAnnotation.from_dict(data)
        if annotation_type == "arrow":
            return ArrowAnnotation.from_dict(data)
        if annotation_type == "segment":
            return SegmentAnnotation.from_dict(data)
    except Exception:
        return None
    return None


class AnnotationCollection:
    def __init__(self) -> None:
        self.items: list[AnnotationType] = []

    def add(self, annotation: AnnotationType) -> AnnotationType:
        if self.get(annotation.id) is not None:
            annotation = deepcopy(annotation)
            annotation.id = generate_annotation_id(annotation.type or "annotation")
        self.items.append(annotation)
        return annotation

    def remove(self, annotation_id: str) -> bool:
        before = len(self.items)
        self.items = [item for item in self.items if item.id != annotation_id]
        return len(self.items) != before

    def get(self, annotation_id: str) -> AnnotationType | None:
        for item in self.items:
            if item.id == annotation_id:
                return item
        return None

    def update(self, annotation_id: str, **changes: Any) -> AnnotationType | None:
        item = self.get(annotation_id)
        if item is None:
            return None
        for key, value in changes.items():
            if key in {"id", "type"}:
                continue
            if hasattr(item, key):
                setattr(item, key, value)
        restored = annotation_from_dict(item.to_dict())
        if restored is not None:
            self.items[self.items.index(item)] = restored
            return restored
        return item

    def clear(self) -> None:
        self.items.clear()

    def to_list(self) -> list[dict[str, Any]]:
        return [annotation_to_dict(item) for item in self.items]

    def load_list(self, values: Any) -> list[str]:
        self.items.clear()
        warnings: list[str] = []
        if values is None:
            return warnings
        if not isinstance(values, list):
            warnings.append("annotations is not a list; ignored.")
            return warnings
        seen_ids: set[str] = set()
        for index, value in enumerate(values):
            item = annotation_from_dict(value)
            if item is None:
                warnings.append(f"annotation[{index}] is invalid or unknown; skipped.")
                continue
            if item.id in seen_ids:
                warnings.append(f"annotation[{index}] has duplicate id; skipped.")
                continue
            seen_ids.add(item.id)
            self.items.append(item)
        return warnings


def add_annotation_smoke_test_items(collection: AnnotationCollection) -> list[AnnotationType]:
    items: list[AnnotationType] = [
        TextAnnotation(x=0.15, y=0.85, text="Annotation", rotation=12.0, color="#222222"),
        ArrowAnnotation(x1=0.25, y1=0.25, x2=0.55, y2=0.55, color="#D83B01"),
        SegmentAnnotation(x1=0.15, y1=0.15, x2=0.75, y2=0.25, color="#107C10"),
    ]
    for item in items:
        collection.add(item)
    return items
