// OpenFreeMap Liberty text layers, adapted to prefer Arabic labels on the hybrid imagery map.
export const OPENFREEMAP_LABEL_LAYERS: any[] = [
  {
    "id": "openfreemap-waterway_line_label",
    "type": "symbol",
    "source": "openfreemap-vector",
    "source-layer": "waterway",
    "minzoom": 10,
    "filter": [
      "match",
      [
        "geometry-type"
      ],
      [
        "LineString",
        "MultiLineString"
      ],
      true,
      false
    ],
    "layout": {
      "symbol-placement": "line",
      "symbol-spacing": 350,
      "text-field": [
        "coalesce",
        [
          "get",
          "name:ar"
        ],
        [
          "get",
          "name:nonlatin"
        ],
        [
          "get",
          "name"
        ],
        [
          "get",
          "name_en"
        ],
        [
          "get",
          "name:latin"
        ]
      ],
      "text-font": [
        "Noto Sans Italic"
      ],
      "text-letter-spacing": 0.2,
      "text-max-width": 5,
      "text-size": 14
    },
    "paint": {
      "text-color": "#74aee9",
      "text-halo-color": "#ffffff",
      "text-halo-width": 1.35,
      "text-halo-blur": 0.2
    }
  },
  {
    "id": "openfreemap-water_name_point_label",
    "type": "symbol",
    "source": "openfreemap-vector",
    "source-layer": "water_name",
    "filter": [
      "match",
      [
        "geometry-type"
      ],
      [
        "MultiPoint",
        "Point"
      ],
      true,
      false
    ],
    "layout": {
      "text-field": [
        "coalesce",
        [
          "get",
          "name:ar"
        ],
        [
          "get",
          "name:nonlatin"
        ],
        [
          "get",
          "name"
        ],
        [
          "get",
          "name_en"
        ],
        [
          "get",
          "name:latin"
        ]
      ],
      "text-font": [
        "Noto Sans Italic"
      ],
      "text-letter-spacing": 0.2,
      "text-max-width": 5,
      "text-size": [
        "interpolate",
        [
          "linear"
        ],
        [
          "zoom"
        ],
        0,
        10,
        8,
        14
      ]
    },
    "paint": {
      "text-color": "#495e91",
      "text-halo-color": "#ffffff",
      "text-halo-width": 1.35,
      "text-halo-blur": 0.2
    }
  },
  {
    "id": "openfreemap-water_name_line_label",
    "type": "symbol",
    "source": "openfreemap-vector",
    "source-layer": "water_name",
    "filter": [
      "match",
      [
        "geometry-type"
      ],
      [
        "LineString",
        "MultiLineString"
      ],
      true,
      false
    ],
    "layout": {
      "symbol-placement": "line",
      "symbol-spacing": 350,
      "text-field": [
        "coalesce",
        [
          "get",
          "name:ar"
        ],
        [
          "get",
          "name:nonlatin"
        ],
        [
          "get",
          "name"
        ],
        [
          "get",
          "name_en"
        ],
        [
          "get",
          "name:latin"
        ]
      ],
      "text-font": [
        "Noto Sans Italic"
      ],
      "text-letter-spacing": 0.2,
      "text-max-width": 5,
      "text-size": 14
    },
    "paint": {
      "text-color": "#495e91",
      "text-halo-color": "#ffffff",
      "text-halo-width": 1.35,
      "text-halo-blur": 0.2
    }
  },
  {
    "id": "openfreemap-poi_r20",
    "type": "symbol",
    "source": "openfreemap-vector",
    "source-layer": "poi",
    "minzoom": 17,
    "filter": [
      "all",
      [
        "match",
        [
          "geometry-type"
        ],
        [
          "MultiPoint",
          "Point"
        ],
        true,
        false
      ],
      [
        ">=",
        [
          "get",
          "rank"
        ],
        20
      ]
    ],
    "layout": {
      "icon-image": [
        "match",
        [
          "get",
          "subclass"
        ],
        [
          "florist",
          "furniture"
        ],
        [
          "get",
          "subclass"
        ],
        [
          "get",
          "class"
        ]
      ],
      "text-anchor": "top",
      "text-field": [
        "coalesce",
        [
          "get",
          "name:ar"
        ],
        [
          "get",
          "name:nonlatin"
        ],
        [
          "get",
          "name"
        ],
        [
          "get",
          "name_en"
        ],
        [
          "get",
          "name:latin"
        ]
      ],
      "text-font": [
        "Noto Sans Italic"
      ],
      "text-max-width": 9,
      "text-offset": [
        0,
        0.6
      ],
      "text-size": 12
    },
    "paint": {
      "text-color": "#666",
      "text-halo-blur": 0.2,
      "text-halo-color": "#ffffff",
      "text-halo-width": 1.35
    }
  },
  {
    "id": "openfreemap-poi_r7",
    "type": "symbol",
    "source": "openfreemap-vector",
    "source-layer": "poi",
    "minzoom": 16,
    "filter": [
      "all",
      [
        "match",
        [
          "geometry-type"
        ],
        [
          "MultiPoint",
          "Point"
        ],
        true,
        false
      ],
      [
        ">=",
        [
          "get",
          "rank"
        ],
        7
      ],
      [
        "<",
        [
          "get",
          "rank"
        ],
        20
      ]
    ],
    "layout": {
      "icon-image": [
        "match",
        [
          "get",
          "subclass"
        ],
        [
          "florist",
          "furniture"
        ],
        [
          "get",
          "subclass"
        ],
        [
          "get",
          "class"
        ]
      ],
      "text-anchor": "top",
      "text-field": [
        "coalesce",
        [
          "get",
          "name:ar"
        ],
        [
          "get",
          "name:nonlatin"
        ],
        [
          "get",
          "name"
        ],
        [
          "get",
          "name_en"
        ],
        [
          "get",
          "name:latin"
        ]
      ],
      "text-font": [
        "Noto Sans Italic"
      ],
      "text-max-width": 9,
      "text-offset": [
        0,
        0.6
      ],
      "text-size": 12
    },
    "paint": {
      "text-color": "#666",
      "text-halo-blur": 0.2,
      "text-halo-color": "#ffffff",
      "text-halo-width": 1.35
    }
  },
  {
    "id": "openfreemap-poi_r1",
    "type": "symbol",
    "source": "openfreemap-vector",
    "source-layer": "poi",
    "minzoom": 15,
    "filter": [
      "all",
      [
        "match",
        [
          "geometry-type"
        ],
        [
          "MultiPoint",
          "Point"
        ],
        true,
        false
      ],
      [
        ">=",
        [
          "get",
          "rank"
        ],
        1
      ],
      [
        "<",
        [
          "get",
          "rank"
        ],
        7
      ]
    ],
    "layout": {
      "icon-image": [
        "match",
        [
          "get",
          "subclass"
        ],
        [
          "florist",
          "furniture"
        ],
        [
          "get",
          "subclass"
        ],
        [
          "get",
          "class"
        ]
      ],
      "text-anchor": "top",
      "text-field": [
        "coalesce",
        [
          "get",
          "name:ar"
        ],
        [
          "get",
          "name:nonlatin"
        ],
        [
          "get",
          "name"
        ],
        [
          "get",
          "name_en"
        ],
        [
          "get",
          "name:latin"
        ]
      ],
      "text-font": [
        "Noto Sans Italic"
      ],
      "text-max-width": 9,
      "text-offset": [
        0,
        0.6
      ],
      "text-size": 12
    },
    "paint": {
      "text-color": "#666",
      "text-halo-blur": 0.2,
      "text-halo-color": "#ffffff",
      "text-halo-width": 1.35
    }
  },
  {
    "id": "openfreemap-poi_transit",
    "type": "symbol",
    "source": "openfreemap-vector",
    "source-layer": "poi",
    "filter": [
      "match",
      [
        "get",
        "class"
      ],
      [
        "airport",
        "bus",
        "rail"
      ],
      true,
      false
    ],
    "layout": {
      "icon-image": [
        "to-string",
        [
          "get",
          "class"
        ]
      ],
      "icon-size": 0.7,
      "text-anchor": "left",
      "text-field": [
        "coalesce",
        [
          "get",
          "name:ar"
        ],
        [
          "get",
          "name:nonlatin"
        ],
        [
          "get",
          "name"
        ],
        [
          "get",
          "name_en"
        ],
        [
          "get",
          "name:latin"
        ]
      ],
      "text-font": [
        "Noto Sans Italic"
      ],
      "text-max-width": 9,
      "text-offset": [
        0.9,
        0
      ],
      "text-size": 12
    },
    "paint": {
      "text-color": "#2e5a80",
      "text-halo-blur": 0.2,
      "text-halo-color": "#ffffff",
      "text-halo-width": 1.35
    }
  },
  {
    "id": "openfreemap-highway-name-path",
    "type": "symbol",
    "source": "openfreemap-vector",
    "source-layer": "transportation_name",
    "minzoom": 15.5,
    "filter": [
      "==",
      [
        "get",
        "class"
      ],
      "path"
    ],
    "layout": {
      "symbol-placement": "line",
      "text-field": [
        "coalesce",
        [
          "get",
          "name:ar"
        ],
        [
          "get",
          "name:nonlatin"
        ],
        [
          "get",
          "name"
        ],
        [
          "get",
          "name_en"
        ],
        [
          "get",
          "name:latin"
        ]
      ],
      "text-font": [
        "Noto Sans Regular"
      ],
      "text-rotation-alignment": "map",
      "text-size": [
        "interpolate",
        [
          "linear"
        ],
        [
          "zoom"
        ],
        13,
        12,
        14,
        13
      ]
    },
    "paint": {
      "text-color": "hsl(30,23%,62%)",
      "text-halo-color": "#ffffff",
      "text-halo-width": 1.35,
      "text-halo-blur": 0.2
    }
  },
  {
    "id": "openfreemap-highway-name-minor",
    "type": "symbol",
    "source": "openfreemap-vector",
    "source-layer": "transportation_name",
    "minzoom": 15,
    "filter": [
      "all",
      [
        "match",
        [
          "geometry-type"
        ],
        [
          "LineString",
          "MultiLineString"
        ],
        true,
        false
      ],
      [
        "match",
        [
          "get",
          "class"
        ],
        [
          "minor",
          "service",
          "track"
        ],
        true,
        false
      ]
    ],
    "layout": {
      "symbol-placement": "line",
      "text-field": [
        "coalesce",
        [
          "get",
          "name:ar"
        ],
        [
          "get",
          "name:nonlatin"
        ],
        [
          "get",
          "name"
        ],
        [
          "get",
          "name_en"
        ],
        [
          "get",
          "name:latin"
        ]
      ],
      "text-font": [
        "Noto Sans Regular"
      ],
      "text-rotation-alignment": "map",
      "text-size": [
        "interpolate",
        [
          "linear"
        ],
        [
          "zoom"
        ],
        13,
        12,
        14,
        13
      ]
    },
    "paint": {
      "text-color": "#666",
      "text-halo-blur": 0.2,
      "text-halo-width": 1.35,
      "text-halo-color": "#ffffff"
    }
  },
  {
    "id": "openfreemap-highway-name-major",
    "type": "symbol",
    "source": "openfreemap-vector",
    "source-layer": "transportation_name",
    "minzoom": 12.2,
    "filter": [
      "match",
      [
        "get",
        "class"
      ],
      [
        "primary",
        "secondary",
        "tertiary",
        "trunk"
      ],
      true,
      false
    ],
    "layout": {
      "symbol-placement": "line",
      "text-field": [
        "coalesce",
        [
          "get",
          "name:ar"
        ],
        [
          "get",
          "name:nonlatin"
        ],
        [
          "get",
          "name"
        ],
        [
          "get",
          "name_en"
        ],
        [
          "get",
          "name:latin"
        ]
      ],
      "text-font": [
        "Noto Sans Regular"
      ],
      "text-rotation-alignment": "map",
      "text-size": [
        "interpolate",
        [
          "linear"
        ],
        [
          "zoom"
        ],
        13,
        12,
        14,
        13
      ]
    },
    "paint": {
      "text-color": "#666",
      "text-halo-blur": 0.2,
      "text-halo-width": 1.35,
      "text-halo-color": "#ffffff"
    }
  },
  {
    "id": "openfreemap-highway-shield-non-us",
    "type": "symbol",
    "source": "openfreemap-vector",
    "source-layer": "transportation_name",
    "minzoom": 8,
    "filter": [
      "all",
      [
        "<=",
        [
          "get",
          "ref_length"
        ],
        6
      ],
      [
        "match",
        [
          "geometry-type"
        ],
        [
          "LineString",
          "MultiLineString"
        ],
        true,
        false
      ],
      [
        "match",
        [
          "get",
          "network"
        ],
        [
          "us-highway",
          "us-interstate",
          "us-state"
        ],
        false,
        true
      ]
    ],
    "layout": {
      "icon-image": [
        "concat",
        "road_",
        [
          "get",
          "ref_length"
        ]
      ],
      "icon-rotation-alignment": "viewport",
      "icon-size": 1,
      "symbol-placement": [
        "step",
        [
          "zoom"
        ],
        "point",
        11,
        "line"
      ],
      "symbol-spacing": 200,
      "text-field": [
        "to-string",
        [
          "get",
          "ref"
        ]
      ],
      "text-font": [
        "Noto Sans Regular"
      ],
      "text-rotation-alignment": "viewport",
      "text-size": 10
    },
    "paint": {
      "text-halo-color": "#ffffff",
      "text-halo-width": 1.35,
      "text-halo-blur": 0.2
    }
  },
  {
    "id": "openfreemap-highway-shield-us-interstate",
    "type": "symbol",
    "source": "openfreemap-vector",
    "source-layer": "transportation_name",
    "minzoom": 7,
    "filter": [
      "all",
      [
        "<=",
        [
          "get",
          "ref_length"
        ],
        6
      ],
      [
        "match",
        [
          "geometry-type"
        ],
        [
          "LineString",
          "MultiLineString"
        ],
        true,
        false
      ],
      [
        "match",
        [
          "get",
          "network"
        ],
        [
          "us-interstate"
        ],
        true,
        false
      ]
    ],
    "layout": {
      "icon-image": [
        "concat",
        [
          "get",
          "network"
        ],
        "_",
        [
          "get",
          "ref_length"
        ]
      ],
      "icon-rotation-alignment": "viewport",
      "icon-size": 1,
      "symbol-placement": [
        "step",
        [
          "zoom"
        ],
        "point",
        7,
        "line",
        8,
        "line"
      ],
      "symbol-spacing": 200,
      "text-field": [
        "to-string",
        [
          "get",
          "ref"
        ]
      ],
      "text-font": [
        "Noto Sans Regular"
      ],
      "text-rotation-alignment": "viewport",
      "text-size": 10
    },
    "paint": {
      "text-halo-color": "#ffffff",
      "text-halo-width": 1.35,
      "text-halo-blur": 0.2
    }
  },
  {
    "id": "openfreemap-road_shield_us",
    "type": "symbol",
    "source": "openfreemap-vector",
    "source-layer": "transportation_name",
    "minzoom": 9,
    "filter": [
      "all",
      [
        "<=",
        [
          "get",
          "ref_length"
        ],
        6
      ],
      [
        "match",
        [
          "geometry-type"
        ],
        [
          "LineString",
          "MultiLineString"
        ],
        true,
        false
      ],
      [
        "match",
        [
          "get",
          "network"
        ],
        [
          "us-highway",
          "us-state"
        ],
        true,
        false
      ]
    ],
    "layout": {
      "icon-image": [
        "concat",
        [
          "get",
          "network"
        ],
        "_",
        [
          "get",
          "ref_length"
        ]
      ],
      "icon-rotation-alignment": "viewport",
      "icon-size": 1,
      "symbol-placement": [
        "step",
        [
          "zoom"
        ],
        "point",
        11,
        "line"
      ],
      "symbol-spacing": 200,
      "text-field": [
        "to-string",
        [
          "get",
          "ref"
        ]
      ],
      "text-font": [
        "Noto Sans Regular"
      ],
      "text-rotation-alignment": "viewport",
      "text-size": 10
    },
    "paint": {
      "text-halo-color": "#ffffff",
      "text-halo-width": 1.35,
      "text-halo-blur": 0.2
    }
  },
  {
    "id": "openfreemap-airport",
    "type": "symbol",
    "source": "openfreemap-vector",
    "source-layer": "aerodrome_label",
    "minzoom": 10,
    "filter": [
      "all",
      [
        "has",
        "iata"
      ]
    ],
    "layout": {
      "icon-image": "airport_11",
      "icon-size": 1,
      "text-anchor": "top",
      "text-field": [
        "coalesce",
        [
          "get",
          "name:ar"
        ],
        [
          "get",
          "name:nonlatin"
        ],
        [
          "get",
          "name"
        ],
        [
          "get",
          "name_en"
        ],
        [
          "get",
          "name:latin"
        ]
      ],
      "text-font": [
        "Noto Sans Regular"
      ],
      "text-max-width": 9,
      "text-offset": [
        0,
        0.6
      ],
      "text-optional": true,
      "text-padding": 2,
      "text-size": 12
    },
    "paint": {
      "text-color": "#666",
      "text-halo-blur": 0.2,
      "text-halo-color": "#ffffff",
      "text-halo-width": 1.35
    }
  },
  {
    "id": "openfreemap-label_other",
    "type": "symbol",
    "source": "openfreemap-vector",
    "source-layer": "place",
    "minzoom": 8,
    "filter": [
      "match",
      [
        "get",
        "class"
      ],
      [
        "city",
        "continent",
        "country",
        "state",
        "town",
        "village"
      ],
      false,
      true
    ],
    "layout": {
      "text-field": [
        "coalesce",
        [
          "get",
          "name:ar"
        ],
        [
          "get",
          "name:nonlatin"
        ],
        [
          "get",
          "name"
        ],
        [
          "get",
          "name_en"
        ],
        [
          "get",
          "name:latin"
        ]
      ],
      "text-font": [
        "Noto Sans Italic"
      ],
      "text-letter-spacing": 0.1,
      "text-max-width": 9,
      "text-size": [
        "interpolate",
        [
          "linear"
        ],
        [
          "zoom"
        ],
        8,
        9,
        12,
        10
      ],
      "text-transform": "uppercase"
    },
    "paint": {
      "text-color": "#333",
      "text-halo-blur": 0.2,
      "text-halo-color": "#ffffff",
      "text-halo-width": 1.35
    }
  },
  {
    "id": "openfreemap-label_village",
    "type": "symbol",
    "source": "openfreemap-vector",
    "source-layer": "place",
    "minzoom": 9,
    "filter": [
      "==",
      [
        "get",
        "class"
      ],
      "village"
    ],
    "layout": {
      "icon-allow-overlap": true,
      "icon-image": [
        "step",
        [
          "zoom"
        ],
        "circle_11_black",
        10,
        ""
      ],
      "icon-optional": false,
      "icon-size": 0.2,
      "text-anchor": "bottom",
      "text-field": [
        "coalesce",
        [
          "get",
          "name:ar"
        ],
        [
          "get",
          "name:nonlatin"
        ],
        [
          "get",
          "name"
        ],
        [
          "get",
          "name_en"
        ],
        [
          "get",
          "name:latin"
        ]
      ],
      "text-font": [
        "Noto Sans Regular"
      ],
      "text-max-width": 8,
      "text-size": [
        "interpolate",
        [
          "exponential",
          1.2
        ],
        [
          "zoom"
        ],
        7,
        10,
        11,
        12
      ]
    },
    "paint": {
      "text-color": "#000",
      "text-halo-blur": 0.2,
      "text-halo-color": "#ffffff",
      "text-halo-width": 1.35
    }
  },
  {
    "id": "openfreemap-label_town",
    "type": "symbol",
    "source": "openfreemap-vector",
    "source-layer": "place",
    "minzoom": 6,
    "filter": [
      "==",
      [
        "get",
        "class"
      ],
      "town"
    ],
    "layout": {
      "icon-allow-overlap": true,
      "icon-image": [
        "step",
        [
          "zoom"
        ],
        "circle_11_black",
        10,
        ""
      ],
      "icon-optional": false,
      "icon-size": 0.2,
      "text-anchor": "bottom",
      "text-field": [
        "coalesce",
        [
          "get",
          "name:ar"
        ],
        [
          "get",
          "name:nonlatin"
        ],
        [
          "get",
          "name"
        ],
        [
          "get",
          "name_en"
        ],
        [
          "get",
          "name:latin"
        ]
      ],
      "text-font": [
        "Noto Sans Regular"
      ],
      "text-max-width": 8,
      "text-size": [
        "interpolate",
        [
          "exponential",
          1.2
        ],
        [
          "zoom"
        ],
        7,
        12,
        11,
        14
      ]
    },
    "paint": {
      "text-color": "#000",
      "text-halo-blur": 0.2,
      "text-halo-color": "#ffffff",
      "text-halo-width": 1.35
    }
  },
  {
    "id": "openfreemap-label_state",
    "type": "symbol",
    "source": "openfreemap-vector",
    "source-layer": "place",
    "minzoom": 5,
    "maxzoom": 8,
    "filter": [
      "==",
      [
        "get",
        "class"
      ],
      "state"
    ],
    "layout": {
      "text-field": [
        "coalesce",
        [
          "get",
          "name:ar"
        ],
        [
          "get",
          "name:nonlatin"
        ],
        [
          "get",
          "name"
        ],
        [
          "get",
          "name_en"
        ],
        [
          "get",
          "name:latin"
        ]
      ],
      "text-font": [
        "Noto Sans Italic"
      ],
      "text-letter-spacing": 0.2,
      "text-max-width": 9,
      "text-size": [
        "interpolate",
        [
          "linear"
        ],
        [
          "zoom"
        ],
        5,
        10,
        8,
        14
      ],
      "text-transform": "uppercase"
    },
    "paint": {
      "text-color": "#333",
      "text-halo-blur": 0.2,
      "text-halo-color": "#ffffff",
      "text-halo-width": 1.35
    }
  },
  {
    "id": "openfreemap-label_city",
    "type": "symbol",
    "source": "openfreemap-vector",
    "source-layer": "place",
    "minzoom": 3,
    "filter": [
      "all",
      [
        "==",
        [
          "get",
          "class"
        ],
        "city"
      ],
      [
        "!=",
        [
          "get",
          "capital"
        ],
        2
      ]
    ],
    "layout": {
      "icon-allow-overlap": true,
      "icon-image": [
        "step",
        [
          "zoom"
        ],
        "circle_11_black",
        9,
        ""
      ],
      "icon-optional": false,
      "icon-size": 0.4,
      "text-anchor": "bottom",
      "text-field": [
        "coalesce",
        [
          "get",
          "name:ar"
        ],
        [
          "get",
          "name:nonlatin"
        ],
        [
          "get",
          "name"
        ],
        [
          "get",
          "name_en"
        ],
        [
          "get",
          "name:latin"
        ]
      ],
      "text-font": [
        "Noto Sans Regular"
      ],
      "text-max-width": 8,
      "text-offset": [
        0,
        -0.1
      ],
      "text-size": [
        "interpolate",
        [
          "exponential",
          1.2
        ],
        [
          "zoom"
        ],
        4,
        11,
        7,
        13,
        11,
        18
      ]
    },
    "paint": {
      "text-color": "#000",
      "text-halo-blur": 0.2,
      "text-halo-color": "#ffffff",
      "text-halo-width": 1.35
    }
  },
  {
    "id": "openfreemap-label_city_capital",
    "type": "symbol",
    "source": "openfreemap-vector",
    "source-layer": "place",
    "minzoom": 3,
    "filter": [
      "all",
      [
        "==",
        [
          "get",
          "class"
        ],
        "city"
      ],
      [
        "==",
        [
          "get",
          "capital"
        ],
        2
      ]
    ],
    "layout": {
      "icon-allow-overlap": true,
      "icon-image": [
        "step",
        [
          "zoom"
        ],
        "circle_11_black",
        9,
        ""
      ],
      "icon-optional": false,
      "icon-size": 0.5,
      "text-anchor": "bottom",
      "text-field": [
        "coalesce",
        [
          "get",
          "name:ar"
        ],
        [
          "get",
          "name:nonlatin"
        ],
        [
          "get",
          "name"
        ],
        [
          "get",
          "name_en"
        ],
        [
          "get",
          "name:latin"
        ]
      ],
      "text-font": [
        "Noto Sans Bold"
      ],
      "text-max-width": 8,
      "text-offset": [
        0,
        -0.2
      ],
      "text-size": [
        "interpolate",
        [
          "exponential",
          1.2
        ],
        [
          "zoom"
        ],
        4,
        12,
        7,
        14,
        11,
        20
      ]
    },
    "paint": {
      "text-color": "#000",
      "text-halo-blur": 0.2,
      "text-halo-color": "#ffffff",
      "text-halo-width": 1.35
    }
  },
  {
    "id": "openfreemap-label_country_3",
    "type": "symbol",
    "source": "openfreemap-vector",
    "source-layer": "place",
    "minzoom": 2,
    "maxzoom": 9,
    "filter": [
      "all",
      [
        "==",
        [
          "get",
          "class"
        ],
        "country"
      ],
      [
        ">=",
        [
          "get",
          "rank"
        ],
        3
      ]
    ],
    "layout": {
      "text-field": [
        "coalesce",
        [
          "get",
          "name:ar"
        ],
        [
          "get",
          "name:nonlatin"
        ],
        [
          "get",
          "name"
        ],
        [
          "get",
          "name_en"
        ],
        [
          "get",
          "name:latin"
        ]
      ],
      "text-font": [
        "Noto Sans Bold"
      ],
      "text-max-width": 6.25,
      "text-size": [
        "interpolate",
        [
          "linear"
        ],
        [
          "zoom"
        ],
        3,
        9,
        7,
        17
      ]
    },
    "paint": {
      "text-color": "#000",
      "text-halo-blur": 0.2,
      "text-halo-color": "#ffffff",
      "text-halo-width": 1.35
    }
  },
  {
    "id": "openfreemap-label_country_2",
    "type": "symbol",
    "source": "openfreemap-vector",
    "source-layer": "place",
    "maxzoom": 9,
    "filter": [
      "all",
      [
        "==",
        [
          "get",
          "class"
        ],
        "country"
      ],
      [
        "==",
        [
          "get",
          "rank"
        ],
        2
      ]
    ],
    "layout": {
      "text-field": [
        "coalesce",
        [
          "get",
          "name:ar"
        ],
        [
          "get",
          "name:nonlatin"
        ],
        [
          "get",
          "name"
        ],
        [
          "get",
          "name_en"
        ],
        [
          "get",
          "name:latin"
        ]
      ],
      "text-font": [
        "Noto Sans Bold"
      ],
      "text-max-width": 6.25,
      "text-size": [
        "interpolate",
        [
          "linear"
        ],
        [
          "zoom"
        ],
        2,
        9,
        5,
        17
      ]
    },
    "paint": {
      "text-color": "#000",
      "text-halo-blur": 0.2,
      "text-halo-color": "#ffffff",
      "text-halo-width": 1.35
    }
  },
  {
    "id": "openfreemap-label_country_1",
    "type": "symbol",
    "source": "openfreemap-vector",
    "source-layer": "place",
    "maxzoom": 9,
    "filter": [
      "all",
      [
        "==",
        [
          "get",
          "class"
        ],
        "country"
      ],
      [
        "==",
        [
          "get",
          "rank"
        ],
        1
      ]
    ],
    "layout": {
      "text-field": [
        "coalesce",
        [
          "get",
          "name:ar"
        ],
        [
          "get",
          "name:nonlatin"
        ],
        [
          "get",
          "name"
        ],
        [
          "get",
          "name_en"
        ],
        [
          "get",
          "name:latin"
        ]
      ],
      "text-font": [
        "Noto Sans Bold"
      ],
      "text-max-width": 6.25,
      "text-size": [
        "interpolate",
        [
          "linear"
        ],
        [
          "zoom"
        ],
        1,
        9,
        4,
        17
      ]
    },
    "paint": {
      "text-color": "#000",
      "text-halo-blur": 0.2,
      "text-halo-color": "#ffffff",
      "text-halo-width": 1.35
    }
  }
];
