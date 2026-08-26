const SQLITE_IDB = 'travel-atlas-sqlite';
const SQLITE_STORE = 'files';
const SQLITE_KEY = 'travel-atlas.sqlite';
const LEGACY_KEY = 'travel-atlas.v3';
const KNOWN_LOCATIONS = {
  '北京':[39.9042,116.4074], '上海':[31.2304,121.4737], '广州':[23.1291,113.2644], '深圳':[22.5431,114.0579], '厦门':[24.4798,118.0894], '杭州':[30.2741,120.1551], '南京':[32.0603,118.7969], '苏州':[31.2989,120.5853], '成都':[30.5728,104.0668], '重庆':[29.563,106.5516], '西安':[34.3416,108.9398], '武汉':[30.5928,114.3055], '长沙':[28.2282,112.9388], '昆明':[25.0389,102.7183], '大理':[25.6065,100.2676], '丽江':[26.8721,100.2299], '天津':[39.3434,117.3616], '青岛':[36.0671,120.3826], '香港':[22.3193,114.1694], '澳门':[22.1987,113.5439], '台北':[25.033,121.5654],
  'China':[35.8617,104.1954], 'Japan':[36.2048,138.2529], 'South Korea':[35.9078,127.7669], 'Thailand':[15.87,100.9925], 'Singapore':[1.3521,103.8198], 'France':[46.2276,2.2137], 'Italy':[41.8719,12.5674], 'Spain':[40.4637,-3.7492], 'Germany':[51.1657,10.4515], 'United Kingdom':[55.3781,-3.436], 'United States':[37.0902,-95.7129], 'Canada':[56.1304,-106.3468], 'Australia':[-25.2744,133.7751], 'New Zealand':[-40.9006,174.886], 'United Arab Emirates':[23.4241,53.8478], 'Turkey':[38.9637,35.2433], 'Indonesia':[-0.7893,113.9213], 'Vietnam':[14.0583,108.2772], 'Malaysia':[4.2105,101.9758],
  '曼谷':[13.7563,100.5018], '普吉':[7.8804,98.3923], '清迈':[18.7883,98.9853], '仰光':[16.8661,96.1951], '河内':[21.0278,105.8342], '胡志明':[10.8231,106.6297], '吉隆坡':[3.139,101.6869], '巴厘岛':[-8.3405,115.092], '暹粒':[13.3633,103.8564], '雅加达':[-6.2088,106.8456]
};
const COUNTRY_CODES = { 'China':'cn', 'Japan':'jp', 'South Korea':'kr', 'Thailand':'th', 'Singapore':'sg', 'France':'fr', 'Italy':'it', 'Spain':'es', 'Germany':'de', 'United Kingdom':'gb', 'United States':'us', 'Canada':'ca', 'Australia':'au', 'New Zealand':'nz', 'United Arab Emirates':'ae', 'Turkey':'tr', 'Indonesia':'id', 'Vietnam':'vn', 'Malaysia':'my', 'Myanmar':'mm', 'Cambodia':'kh', 'Finland':'fi', 'Sweden':'se', 'Norway':'no', 'Denmark':'dk', 'Netherlands':'nl', 'Belgium':'be', 'Switzerland':'ch', 'Austria':'at', 'Portugal':'pt', 'Greece':'gr', 'India':'in', 'Philippines':'ph', 'Russia':'ru', 'Brazil':'br', 'Mexico':'mx', 'Egypt':'eg', 'South Africa':'za' };
const COUNTRY_ALIASES = { 'United States':['United States of America','USA'], 'South Korea':['Republic of Korea'], 'Vietnam':['Viet Nam'], 'Russia':['Russian Federation'] };
const CITY_PROVINCE = {
  '北京':'北京市', '上海':'上海市', '广州':'广东省', '深圳':'广东省', '厦门':'福建省', '杭州':'浙江省', '南京':'江苏省', '苏州':'江苏省', '成都':'四川省', '重庆':'重庆市', '西安':'陕西省', '武汉':'湖北省', '长沙':'湖南省', '昆明':'云南省', '大理':'云南省', '丽江':'云南省', '天津':'天津市', '青岛':'山东省', '香港':'香港特别行政区', '澳门':'澳门特别行政区', '台北':'台湾省'
};
const TRANSPORT_LABELS = { air:'✈ 飞机', rail:'▰ 火车', car:'▱ 汽车', ship:'◒ 轮船', other:'◎ 其他' };
const $ = selector => document.querySelector(selector);
let database, idb, state = { trips:[], destinations:[], transports:[] }, maps = {}, layers = {}, activeLayer = 'footprints', editingDestinationId = null, globe = null, mapView = 'map';

function key(value) { return String(value || '').trim().toLowerCase(); }
function number(value) { return String(value || 0).padStart(2, '0'); }
function tripCaption(id) { return `出行 #${String(id).padStart(4, '0')}`; }
function toast(message) { const element = $('#toast'); element.textContent = message; element.classList.add('show'); setTimeout(() => element.classList.remove('show'), 2600); }
function haversine(a, b) { const rad = value => value * Math.PI / 180, R = 6371, dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng); const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2; return Math.round(R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h))); }
function isChina(point) { return point.lat >= 18 && point.lat <= 54 && point.lng >= 73 && point.lng <= 135; }
function citySearchType(name) { return /[\u4e00-\u9fff]/.test(name) ? 'china' : 'world'; }

function openIndexedDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(SQLITE_IDB, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(SQLITE_STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
function getDatabaseBytes() {
  return new Promise((resolve, reject) => {
    const request = idb.transaction(SQLITE_STORE, 'readonly').objectStore(SQLITE_STORE).get(SQLITE_KEY);
    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error);
  });
}
function persistDatabase() {
  return new Promise((resolve, reject) => {
    const transaction = idb.transaction(SQLITE_STORE, 'readwrite');
    transaction.objectStore(SQLITE_STORE).put(database.export(), SQLITE_KEY);
    transaction.oncomplete = resolve;
    transaction.onerror = () => reject(transaction.error);
  });
}
function run(sql, parameters = []) { database.run(sql, parameters); }
function rows(sql, parameters = []) {
  const statement = database.prepare(sql); statement.bind(parameters); const result = [];
  while (statement.step()) result.push(statement.getAsObject());
  statement.free(); return result;
}
function scalar(sql, parameters = []) { const row = rows(sql, parameters)[0]; return row ? Object.values(row)[0] : null; }
function lastId() { return Number(scalar('SELECT last_insert_rowid()')); }
function createSchema() {
  database.run(`PRAGMA foreign_keys = ON;
    CREATE TABLE IF NOT EXISTS trips (id INTEGER PRIMARY KEY AUTOINCREMENT, created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS destinations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      trip_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      location_type TEXT NOT NULL CHECK(location_type IN ('china','world')),
      visited_date TEXT NOT NULL,
      note TEXT DEFAULT '', lat REAL NOT NULL, lng REAL NOT NULL,
      FOREIGN KEY(trip_id) REFERENCES trips(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS transport_segments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      trip_id INTEGER NOT NULL,
      sequence_no INTEGER NOT NULL,
      mode TEXT NOT NULL,
      from_name TEXT NOT NULL, from_lat REAL NOT NULL, from_lng REAL NOT NULL,
      to_name TEXT NOT NULL, to_lat REAL NOT NULL, to_lng REAL NOT NULL,
      distance_km INTEGER NOT NULL,
      FOREIGN KEY(trip_id) REFERENCES trips(id) ON DELETE CASCADE
    );`);
}
function refreshState() {
  state.trips = rows('SELECT id, created_at FROM trips ORDER BY id DESC').map(item => ({ id:Number(item.id), createdAt:item.created_at }));
  state.destinations = rows('SELECT id, trip_id, name, location_type, visited_date, note, lat, lng FROM destinations ORDER BY visited_date DESC, id DESC').map(item => ({ id:Number(item.id), tripId:Number(item.trip_id), name:item.name, type:item.location_type, date:item.visited_date, note:item.note || '', lat:Number(item.lat), lng:Number(item.lng) }));
  state.transports = rows('SELECT id, trip_id, sequence_no, mode, from_name, from_lat, from_lng, to_name, to_lat, to_lng, distance_km FROM transport_segments ORDER BY trip_id, sequence_no').map(item => ({ id:Number(item.id), tripId:Number(item.trip_id), sequence:Number(item.sequence_no), transport:item.mode, from:{ name:item.from_name, lat:Number(item.from_lat), lng:Number(item.from_lng) }, to:{ name:item.to_name, lat:Number(item.to_lat), lng:Number(item.to_lng) }, distance:Number(item.distance_km) }));
}
async function migrateLegacyData() {
  if (scalar('SELECT COUNT(*) FROM trips') || !localStorage.getItem(LEGACY_KEY)) return;
  try {
    const legacy = JSON.parse(localStorage.getItem(LEGACY_KEY)); if (!legacy) return;
    const sourceTripIds = new Set([...(legacy.trips || []).map(item => item.id), ...(legacy.destinations || []).map(item => item.tripId), ...(legacy.transports || []).map(item => item.tripId)]);
    const idMap = new Map(); run('BEGIN');
    sourceTripIds.forEach(sourceId => { run('INSERT INTO trips (created_at) VALUES (?)', [new Date().toISOString()]); idMap.set(sourceId, lastId()); });
    (legacy.destinations || []).forEach(item => run('INSERT INTO destinations (trip_id,name,location_type,visited_date,note,lat,lng) VALUES (?,?,?,?,?,?,?)', [idMap.get(item.tripId), item.name, item.type || 'world', item.date || '', item.note || '', item.lat, item.lng]));
    (legacy.transports || []).forEach((item, index) => run('INSERT INTO transport_segments (trip_id,sequence_no,mode,from_name,from_lat,from_lng,to_name,to_lat,to_lng,distance_km) VALUES (?,?,?,?,?,?,?,?,?,?)', [idMap.get(item.tripId), item.sequence || index + 1, item.transport || 'other', item.from.name, item.from.lat, item.from.lng, item.to.name, item.to.lat, item.to.lng, item.distance || haversine(item.from, item.to)]));
    run('COMMIT'); await persistDatabase();
  } catch (error) { try { run('ROLLBACK'); } catch {} }
}

async function resolveLocation(name, type, countryCodes = []) {
  const normalized = key(name), known = Object.entries(KNOWN_LOCATIONS).find(([location]) => key(location) === normalized);
  if (known) return { name:name.trim(), lat:known[1][0], lng:known[1][1] };
  const params = new URLSearchParams({ format:'jsonv2', limit:'1', q:name });
  if (countryCodes.length) params.set('countrycodes', countryCodes.join(','));
  const response = await fetch(`https://nominatim.openstreetmap.org/search?${params.toString()}`, { headers:{ Accept:'application/json' } });
  if (!response.ok) throw new Error('location'); const matches = await response.json();
  if (!matches.length) throw new Error('location'); return { name:name.trim(), lat:Number(matches[0].lat), lng:Number(matches[0].lon) };
}

function createMaps() {
  const tiles = 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png';
  maps.world = L.map('worldLeaflet', { zoomControl:false, worldCopyJump:true }).setView([22, 18], 2);
  L.tileLayer(tiles, { maxZoom:18, attribution:'&copy; OpenStreetMap &copy; CARTO' }).addTo(maps.world);
  L.control.zoom({ position:'bottomright' }).addTo(maps.world);
  // 省级边界必须位于国家图层之上，确保中国内部的涂色与描边始终可见。
  maps.world.createPane('countryPane'); maps.world.getPane('countryPane').style.zIndex = 401;
  maps.world.createPane('provincePane'); maps.world.getPane('provincePane').style.zIndex = 402;
  maps.world.createPane('routePane'); maps.world.getPane('routePane').style.zIndex = 430;
  // 先创建边界图层，再创建 marker/route 图层，这样边界在底层
  layers.world = { provinces: L.layerGroup().addTo(maps.world), countries: L.layerGroup().addTo(maps.world) };
  layers.world.points = L.layerGroup().addTo(maps.world);
  layers.world.routes = L.layerGroup().addTo(maps.world);
  loadCountryBoundaries();
  loadProvinceBoundaries();
}
async function loadProvinceBoundaries() { try { const response = await fetch('https://geo.datav.aliyun.com/areas_v3/bound/100000_full.json'); const data = await response.json(); layers.world.provinceData = data; console.log('Province data loaded:', data.features?.length, 'features'); renderProvinceLayer(); renderStats(); renderGlobeLayers(); } catch(e) { console.warn('Province layer failed:', e); } }
async function loadCountryBoundaries() { try { const response = await fetch('https://cdn.jsdelivr.net/gh/holtzy/D3-graph-gallery@master/DATA/world.geojson'); const data = await response.json(); layers.world.countryData = data; console.log('Country data loaded:', data.features?.length, 'features'); renderCountryLayer(); renderGlobeLayers(); } catch { $('#worldTip').textContent = '网络地图已加载；国家边界图层暂不可用。'; } }
function featureName(feature) { return feature.properties.name || feature.properties.NAME || feature.properties.ADMIN || ''; }
function pointInRing(point, ring) {
  var inside = false, x = point.lng, y = point.lat;
  for (var i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    var xi = ring[i][0], yi = ring[i][1], xj = ring[j][0], yj = ring[j][1];
    var intersects = ((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi || Number.EPSILON) + xi);
    if (intersects) inside = !inside;
  }
  return inside;
}
function featureContainsPoint(feature, point) {
  if (!feature?.geometry || !Number.isFinite(point?.lat) || !Number.isFinite(point?.lng)) return false;
  var geometry = feature.geometry, polygons = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.type === 'MultiPolygon' ? geometry.coordinates : [];
  return polygons.some(function(polygon) {
    // 第一个环是外轮廓；落在任何内环（洞）中则不视为省/国境内。
    return polygon.length && pointInRing(point, polygon[0]) && !polygon.slice(1).some(function(hole) { return pointInRing(point, hole); });
  });
}
function provinceVisited(feature) {
  var province = featureName(feature);
  return state.destinations.some(function(item) {
    return item.type === 'china' && (key(CITY_PROVINCE[item.name]) === key(province) || featureContainsPoint(feature, item));
  });
}
function renderProvinceLayer() {
  if (!layers.world?.provinceData) return;
  try {
    layers.world.provinces.clearLayers();
    var g = L.geoJSON(layers.world.provinceData, {
      pane: 'provincePane',
      style: function(f) { var v = provinceVisited(f); return { color: v ? '#c75534' : '#aebeb1', weight: v ? 2.5 : .7, fillColor: v ? '#e8b854' : '#dfe6db', fillOpacity: v ? .66 : .20 }; },
      onEachFeature: function(f, l) { if (provinceVisited(f)) l.bindTooltip(featureName(f) + ' · 已到访', { sticky: true }); }
    });
    g.addTo(layers.world.provinces);
  } catch(e) { console.warn('renderProvinceLayer error', e); }
}
function countryVisited(feature) {
  var country = featureName(feature);
  return state.destinations.some(function(item) {
    return item.type === 'world' && ([item.name].concat(COUNTRY_ALIASES[item.name] || []).some(function(alias) { return key(alias) === key(country); }) || featureContainsPoint(feature, item));
  });
}
function renderCountryLayer() {
  if (!layers.world?.countryData) return;
  try {
    layers.world.countries.clearLayers();
    var g = L.geoJSON(layers.world.countryData, {
      pane: 'countryPane',
      style: function(f) { var v = countryVisited(f); return { color: v ? '#c75534' : '#b8c5b9', weight: v ? 2.25 : .55, fillColor: v ? '#e8b854' : '#dfe6db', fillOpacity: v ? .64 : .14 }; },
      onEachFeature: function(f, l) { if (countryVisited(f)) l.bindTooltip(featureName(f) + ' · 已到访', { sticky: true }); }
    });
    g.addTo(layers.world.countries);
  } catch(e) { console.warn('renderCountryLayer error', e); }
}

// --- 3D globe -------------------------------------------------------------
// The globe deliberately consumes the very same destination and transport
// datasets as Leaflet, so switching view never creates a second set of rules.
function createGlobe() {
  if (globe || !window.Globe || !$('#globeCanvas')) return;
  const panel = $('#worldMap'), container = $('#globeCanvas');
  globe = Globe()(container)
    .width(panel.clientWidth || 900)
    .height(panel.clientHeight || 500)
    .backgroundColor('#0b1820')
    .globeImageUrl('https://unpkg.com/three-globe/example/img/earth-blue-marble.jpg')
    .bumpImageUrl('https://unpkg.com/three-globe/example/img/earth-topology.png')
    .showAtmosphere(true)
    .atmosphereColor('#8ac7ce')
    .atmosphereAltitude(.16)
    .polygonGeoJsonGeometry(item => item.geometry)
    .polygonCapColor(() => '#e8b854')
    .polygonSideColor(() => 'rgba(170,100,42,.42)')
    .polygonStrokeColor(() => '#c75534')
    .polygonAltitude(item => item.kind === 'province' ? .022 : .014)
    .polygonLabel(item => `${featureName(item)} · 已到访`)
    .polygonsTransitionDuration(0)
    .pointLat('lat').pointLng('lng').pointAltitude(.026).pointRadius(.24)
    .pointColor(() => '#d36b45')
    .pointLabel(item => `<b>${item.name}</b><br>${item.date || ''}<br>${item.note || '一段正在收藏的记忆。'}`)
    .arcStartLat(item => item.from.lat).arcStartLng(item => item.from.lng)
    .arcEndLat(item => item.to.lat).arcEndLng(item => item.to.lng)
    .arcColor(item => globeRouteStyle(item.transport).color)
    .arcStroke(() => 1.25)
    .arcAltitude(item => Math.min(.43, .09 + item.globeLane * .026))
    .arcDashLength(item => item.transport === 'air' ? .22 : item.transport === 'ship' ? .13 : .07)
    .arcDashGap(item => item.transport === 'air' ? .14 : .06)
    .arcDashAnimateTime(item => item.transport === 'air' ? 2600 : 0)
    .arcLabel(item => `${globeRouteStyle(item.transport).label} · ${item.from.name} → ${item.to.name}<br>${item.distance.toLocaleString()} km`)
    .onPointClick(item => toast(`${item.name} · ${item.date || '未填写日期'}`))
    .onPolygonClick(item => item.visited && toast(`${featureName(item)} · 已到访`));
  globe.controls().autoRotate = true;
  globe.controls().autoRotateSpeed = .28;
  globe.pointOfView({ lat:25, lng:108, altitude:2.15 }, 0);
  renderGlobeLayers();
}
function resizeGlobe() {
  if (!globe) return;
  const panel = $('#worldMap');
  globe.width(panel.clientWidth).height(panel.clientHeight);
}
function globeRouteStyle(mode) {
  return {
    air:  { color:'#e58a64', label:'航班航迹' },
    rail: { color:'#78c2ab', label:'铁路图' },
    ship: { color:'#67b8d6', label:'轮船航迹' },
    car:  { color:'#e5bd79', label:'汽车路线' }
  }[mode] || { color:'#c7d2cc', label:'交通路线' };
}
function renderGlobeLayers() {
  if (!globe) return;
  // Globe.gl needs to tessellate each boundary into a 3D mesh.  The full world
  // plus all Chinese administrative borders can lock up a normal browser, so
  // only draw the places that need a highlight; the basemap remains the globe.
  const countries = (layers.world?.countryData?.features || []).filter(countryVisited).map(feature => Object.assign({}, feature, { kind:'country', visited:true }));
  const provinces = (layers.world?.provinceData?.features || []).filter(provinceVisited).map(feature => Object.assign({}, feature, { kind:'province', visited:true }));
  globe.polygonsData(countries.concat(provinces));
  if (activeLayer === 'footprints') {
    globe.pointsData(state.destinations);
    globe.arcsData([]);
    return;
  }
  const segments = state.transports.filter(item => item.transport === activeLayer);
  const lanes = buildRouteLanes(segments);
  globe.pointsData([]);
  globe.arcsData(segments.map(item => {
    const direction = routeLocationKey(item.from) < routeLocationKey(item.to) ? .55 : 1.15;
    return Object.assign({}, item, { globeLane:(lanes.get(item.id) || 0) + direction });
  }));
}
function setMapView(nextView) {
  mapView = nextView;
  const globeMode = mapView === 'globe';
  const panel = $('#worldMap'), leafletCanvas = $('#worldLeaflet');
  panel.classList.toggle('globe-active', globeMode);
  // Leaflet creates nested panes with explicit z-index values. Hide its root
  // directly as well, so none of those panes can remain above the WebGL canvas.
  leafletCanvas.style.display = globeMode ? 'none' : '';
  leafletCanvas.style.visibility = globeMode ? 'hidden' : '';
  document.querySelectorAll('.map-view-button').forEach(button => button.classList.toggle('active', button.dataset.mapView === mapView));
  if (globeMode) {
    createGlobe();
    if (!globe) { toast('3D 地球组件暂时无法加载，请检查网络后重试。'); setMapView('map'); return; }
    globe.resumeAnimation?.();
    globe.controls().autoRotate = true;
    requestAnimationFrame(() => { resizeGlobe(); renderGlobeLayers(); });
    $('#worldTip').textContent = '拖动旋转、滚轮缩放；到访涂色和交通航迹与 2D 地图同步';
  } else {
    globe?.pauseAnimation?.();
    if (globe) globe.controls().autoRotate = false;
    setTimeout(() => maps.world?.invalidateSize(), 0);
    $('#worldTip').textContent = '蓝色边界为曾经抵达过的国家';
  }
}

function popup(place) { return `<div class="place-popup"><p>${tripCaption(place.tripId)} · ${place.date}</p><h3>${place.name}</h3><span>${place.note || '一段正在收藏的记忆。'}</span><div class="popup-actions"><button type="button" data-edit-destination="${place.id}">编辑</button><button type="button" class="danger" data-delete-destination="${place.id}">删除</button></div></div>`; }
function renderFootprintMarkers() { state.destinations.forEach(place => { L.circleMarker([place.lat,place.lng], { radius:7,color:'#fff5e4',weight:2.5,fillColor:'#d36b45',fillOpacity:1 }).bindPopup(popup(place), { closeButton:false, offset:[0,-3] }).addTo(layers.world.points); }); }
// --- Transport arc generator ---
// 球面大圆插值 (slerp) + 恒定法向量方向的正弦偏移。
//   bulge > 0  →  arc bows in the +normal direction
//   bulge < 0  →  arc bows in the -normal direction
// A→B 和 B→A 只需传相反的 bulge 即可分向两侧凸。
function greatCircleArc(from, to, numPoints, bulge) {
  if (typeof numPoints === 'undefined') numPoints = 80;
  if (typeof bulge === 'undefined') bulge = 0;
  var toRad = Math.PI / 180, toDeg = 180 / Math.PI;
  var lat1 = from.lat * toRad, lng1 = from.lng * toRad;
  var lat2 = to.lat * toRad, lng2 = to.lng * toRad;
  var dLng = lng2 - lng1;
  if (dLng > Math.PI) dLng -= 2 * Math.PI;
  else if (dLng < -Math.PI) dLng += 2 * Math.PI;
  var cosO = Math.sin(lat1) * Math.sin(lat2) + Math.cos(lat1) * Math.cos(lat2) * Math.cos(dLng);
  cosO = Math.max(-1, Math.min(1, cosO));
  var omega = Math.acos(cosO);
  var sinO = Math.sin(omega);

  // 大圆平面的单位法向量 a × b（整条弧恒定）
  var a0 = Math.cos(lat1) * Math.cos(lng1), a1 = Math.cos(lat1) * Math.sin(lng1), a2 = Math.sin(lat1);
  var b0 = Math.cos(lat2) * Math.cos(lng2), b1 = Math.cos(lat2) * Math.sin(lng2), b2 = Math.sin(lat2);
  var nx = a1 * b2 - a2 * b1, ny = a2 * b0 - a0 * b2, nz = a0 * b1 - a1 * b0;
  var nLen = Math.sqrt(nx * nx + ny * ny + nz * nz);
  var bulgeRad = bulge * toRad;

  var points = [];
  for (var i = 0; i <= numPoints; i++) {
    var t = i / numPoints;
    var lat, lng;
    // slerp
    if (sinO < 1e-6) { lat = lat1 + (lat2 - lat1) * t; lng = lng1 + dLng * t; }
    else {
      var sa = Math.sin((1 - t) * omega) / sinO, sb = Math.sin(t * omega) / sinO;
      var x = sa * a0 + sb * b0, y = sa * a1 + sb * b1, z = sa * a2 + sb * b2;
      lat = Math.atan2(z, Math.sqrt(x * x + y * y));
      lng = Math.atan2(y, x);
    }
    // 偏移：绕法向量 n 旋转 amp 弧度（p' = p·cosA + n·sinA）
    if (bulgeRad !== 0 && nLen > 1e-12) {
      var amp = Math.sin(Math.PI * t) * bulgeRad;
      var cL = Math.cos(lat), sL = Math.sin(lat);
      var cG = Math.cos(lng), sG = Math.sin(lng);
      var unx = nx / nLen, uny = ny / nLen, unz = nz / nLen;
      var cosA = Math.cos(amp), sinA = Math.sin(amp);
      var rx = cL * cG * cosA + unx * sinA;
      var ry = cL * sG * cosA + uny * sinA;
      var rz = sL * cosA + unz * sinA;
      lat = Math.atan2(rz, Math.sqrt(rx * rx + ry * ry)) * toDeg;
      lng = Math.atan2(ry, rx) * toDeg;
    } else { lat *= toDeg; lng *= toDeg; }
    points.push([lat, lng]);
  }
  return points;
}

// --- Route lane assignment (air / rail) ---
// 每个交通段使用独立“车道”：同向多次依次外扩，往返则由大圆法向量自动分居两侧。
function routeLocationKey(point) {
  // 坐标而不是名称作为分组依据，避免同城别名或中英文名称造成重复轨迹。
  return Number(point.lat).toFixed(5) + ',' + Number(point.lng).toFixed(5);
}
function routePairKey(segment) {
  var a = routeLocationKey(segment.from), b = routeLocationKey(segment.to);
  return a < b ? a + '|' + b : b + '|' + a;
}
function routeDirectionKey(segment) {
  return routeLocationKey(segment.from) + '→' + routeLocationKey(segment.to);
}
function routePointCount(segment) {
  var distance = Math.max(segment.distance || haversine(segment.from, segment.to), 1);
  return Math.max(36, Math.min(140, Math.ceil(distance / 95)));
}
function buildRouteLanes(segments) {
  var pairGroups = new Map(), lanes = new Map();
  segments.forEach(function(segment) {
    var pairKey = routePairKey(segment);
    if (!pairGroups.has(pairKey)) pairGroups.set(pairKey, new Map());
    var directions = pairGroups.get(pairKey), directionKey = routeDirectionKey(segment);
    if (!directions.has(directionKey)) directions.set(directionKey, []);
    directions.get(directionKey).push(segment);
  });

  pairGroups.forEach(function(directions) {
    var hasReturnRoute = directions.size > 1;
    directions.forEach(function(directionSegments) {
      directionSegments.sort(function(a, b) { return Number(a.id || 0) - Number(b.id || 0); });
      directionSegments.forEach(function(segment, index) {
        var distance = Math.max(segment.distance || haversine(segment.from, segment.to), 1);
        // 长途稍微放大偏移，短途保持克制；每条重复路线占一条新的平滑车道。
        var laneStep = Math.min(1.7, 0.32 + distance / 6500);
        var baseLane = hasReturnRoute ? laneStep * 1.15 : laneStep * 0.75;
        // 反向的大圆法向量天然相反，因此同为正值会落到另一侧；不要给返程取负值。
        lanes.set(segment.id, baseLane + index * laneStep * 0.86);
      });
    });
  });
  return lanes;
}

// 往返和重复出行都使用平滑的大圆弧，并按 route lane 分离，避免重叠。
function renderRoutes(mode) {
  var segs = state.transports.filter(function(s) { return s.transport === mode; });
  var lanes = buildRouteLanes(segs);
  var routeStyle = {
    air:  { color:'#c75c3b', weight:2.4, opacity:.85, dashArray:'8 8', icon:'✈', label:'航班航迹' },
    rail: { color:'#25584e', weight:3, opacity:.84, dashArray:'2 7', icon:'◆', label:'铁路图' },
    ship: { color:'#26728c', weight:3, opacity:.88, dashArray:'3 8', icon:'⚓', label:'轮船航迹' },
    car:  { color:'#946437', weight:2.7, opacity:.88, dashArray:'1 7', icon:'◆', label:'汽车路线' }
  }[mode] || { color:'#5d6d68', weight:2.5, opacity:.84, dashArray:'4 7', icon:'◆', label:'交通路线' };
  segs.forEach(function(s) {
    var pts = greatCircleArc(s.from, s.to, routePointCount(s), lanes.get(s.id) || 0);
    var opts = { color:routeStyle.color, weight:routeStyle.weight, opacity:routeStyle.opacity, dashArray:routeStyle.dashArray, lineCap:'round', smoothFactor:0, pane:'routePane' };
    L.polyline(pts, opts)
      .bindTooltip(routeStyle.label + ' · ' + s.from.name + ' → ' + s.to.name + '<br>' + s.distance.toLocaleString() + ' km', { sticky:true })
      .addTo(layers.world.routes);
    var mid = pts[Math.floor(pts.length / 2)];
    L.marker(mid, { interactive:false, icon:L.divIcon({ className:'route-arrow ' + mode, html:routeStyle.icon, iconSize:[16,16], iconAnchor:[8,8] }) }).addTo(layers.world.routes);
  });
  var tot = segs.reduce(function(s, i) { return s + i.distance; }, 0);
  var lbl = routeStyle.label;
  $('#worldMapCaption').textContent = segs.length ? segs.length + ' 段' + lbl + ' · ' + tot.toLocaleString() + ' km' : '还没有可展示的' + lbl;
}
function renderMapLayers() { layers.world.points?.clearLayers(); layers.world.routes?.clearLayers(); renderProvinceLayer(); renderCountryLayer(); if (activeLayer === 'footprints') { renderFootprintMarkers(); } else { renderRoutes(activeLayer); } renderGlobeLayers(); }

function visitedProvinceCount() { if (layers.world?.provinceData?.features) return layers.world.provinceData.features.filter(provinceVisited).length; return new Set(state.destinations.filter(item=>item.type==='china').map(item=>CITY_PROVINCE[item.name]).filter(Boolean)).size; }
function renderStats() { const provinces=visitedProvinceCount(), countries=state.destinations.filter(item=>item.type==='world').length, air=state.transports.filter(item=>item.transport==='air').reduce((sum,item)=>sum+item.distance,0), rail=state.transports.filter(item=>item.transport==='rail').reduce((sum,item)=>sum+item.distance,0), ship=state.transports.filter(item=>item.transport==='ship').reduce((sum,item)=>sum+item.distance,0), car=state.transports.filter(item=>item.transport==='car').reduce((sum,item)=>sum+item.distance,0); $('#provinceCount').textContent=number(provinces); $('#countryCount').textContent=number(countries); $('#airDistance').textContent=air.toLocaleString(); $('#railDistance').textContent=rail.toLocaleString(); $('#shipDistance').textContent=ship.toLocaleString(); $('#carDistance').textContent=car.toLocaleString(); $('#worldMapCount').innerHTML=`${number(provinces)} <small>PROVINCES</small> / ${number(countries)} <small>COUNTRIES</small>`; $('#yearTrips').textContent=number(state.trips.length); }
function renderOverview() { const destinations=[...state.destinations]; $('#overviewCount').textContent=`${number(destinations.length)} 条足迹`; $('#footprintList').innerHTML=destinations.length?destinations.map((place,index)=>{ const connections=state.transports.filter(segment=>segment.tripId===place.tripId).length; return `<article class="footprint-row"><span class="footprint-index">${String(index+1).padStart(2,'0')}</span><div class="footprint-main"><i class="footprint-dot"></i><div><strong>${place.name}</strong><span>${place.type==='china'?'中国城市':'世界国家'} · ${place.date||'未填写日期'}</span></div></div><span class="footprint-trip">${tripCaption(place.tripId)}</span><span class="footprint-meta">${connections?`${connections} 段交通`:'尚未添加交通段'}</span><div class="footprint-actions"><button type="button" data-edit-destination="${place.id}">编辑</button><button type="button" class="danger" data-delete-destination="${place.id}">删除</button></div></article>`;}).join(''):'<div class="empty-overview">尚无足迹。添加第一处目的地后，它会出现在这里。</div>'; }
function render() { renderStats(); renderOverview(); renderMapLayers(); }

function destinationRowTemplate() { return `<div class="trip-entry-row destination-row"><span class="row-label">目的地</span><select class="destination-type" aria-label="地点类型"><option value="china">中国城市</option><option value="world">世界国家</option></select><input class="destination-name" required placeholder="厦门 / Italy" aria-label="目的地" /><button class="row-remove" type="button" data-remove-destination-row aria-label="删除目的地">×</button><textarea class="destination-note" rows="2" placeholder="一句记忆（可选）"></textarea></div>`; }
function transportRowTemplate(index) { return `<div class="trip-entry-row transport-row"><input class="segment-from" required placeholder="起点城市，例如上海" aria-label="起点城市" /><span class="segment-arrow">→</span><input class="segment-to" required placeholder="终点城市，例如东京" aria-label="终点城市" /><select class="segment-mode" aria-label="交通方式">${Object.entries(TRANSPORT_LABELS).map(([value,label])=>`<option value="${value}">${label}</option>`).join('')}</select><button class="row-remove" type="button" data-remove-transport-row aria-label="删除交通段">×</button></div>`; }
function resetTripForm() { $('#tripForm').reset(); $('#tripDate').value = new Date().toISOString().slice(0,7); $('#destinationRows').innerHTML=destinationRowTemplate(); $('#transportRows').innerHTML='<div class="no-segments">还没有交通段。可按实际出发、转机或换乘顺序逐段添加。</div>'; }
function addDestinationRow() { $('#destinationRows').insertAdjacentHTML('beforeend',destinationRowTemplate()); }
function addTransportRow() { const holder=$('#transportRows'); holder.querySelector('.no-segments')?.remove(); holder.insertAdjacentHTML('beforeend',transportRowTemplate(holder.querySelectorAll('.transport-row').length+1)); }

async function saveTrip(event) {
  event.preventDefault(); const button=$('#saveTrip'), destinationRows=[...document.querySelectorAll('.destination-row')], transportRows=[...document.querySelectorAll('.transport-row')];
  button.disabled=true; button.textContent='正在定位并保存…';
  try {
    const tripDate = $('#tripDate').value;
    const destinations=await Promise.all(destinationRows.map(async row=>{ const name=row.querySelector('.destination-name').value.trim(), type=row.querySelector('.destination-type').value; const codes = type === 'china' ? ['cn'] : []; return { ...(await resolveLocation(name,type,codes)), type, date:tripDate, note:row.querySelector('.destination-note').value.trim() }; }));
    const destCountryCodes = [...new Set(destinations.map(item => COUNTRY_CODES[item.name] || '').filter(Boolean))];
    const segments=await Promise.all(transportRows.map(async row=>{ const fromName=row.querySelector('.segment-from').value.trim(), toName=row.querySelector('.segment-to').value.trim(), [from,to]=await Promise.all([resolveLocation(fromName,citySearchType(fromName),destCountryCodes),resolveLocation(toName,citySearchType(toName),destCountryCodes)]); if (from.lat===to.lat&&from.lng===to.lng) throw new Error('same-city'); return { from,to,mode:row.querySelector('.segment-mode').value }; }));
    run('BEGIN'); run('INSERT INTO trips (created_at) VALUES (?)',[new Date().toISOString()]); const tripId=lastId(); destinations.forEach(item=>run('INSERT INTO destinations (trip_id,name,location_type,visited_date,note,lat,lng) VALUES (?,?,?,?,?,?,?)',[tripId,item.name,item.type,item.date,item.note,item.lat,item.lng])); segments.forEach((item,index)=>run('INSERT INTO transport_segments (trip_id,sequence_no,mode,from_name,from_lat,from_lng,to_name,to_lat,to_lng,distance_km) VALUES (?,?,?,?,?,?,?,?,?,?)',[tripId,index+1,item.mode,item.from.name,item.from.lat,item.from.lng,item.to.name,item.to.lat,item.to.lng,haversine(item.from,item.to)])); run('COMMIT'); await persistDatabase(); refreshState(); render(); $('#addDialog').close(); resetTripForm(); toast(`${tripCaption(tripId)} 已保存`);
  } catch (error) { try { run('ROLLBACK'); } catch {} $('#addDialog').close(); toast(error.message==='same-city'?'一段交通的起点和终点不能相同。':'请填写有效地点，并检查网络后重试。'); }
  finally { button.disabled=false; button.innerHTML='保存这次出行 <span>↗</span>'; }
}
function openEditDestination(destinationId) { const place=state.destinations.find(item=>item.id===Number(destinationId)); if (!place) return; editingDestinationId=place.id; $('#editTripLabel').textContent=`${tripCaption(place.tripId)} · 交通段保持独立的城市定位，不会因编辑足迹而改动。`; $('#editType').value=place.type; $('#editName').value=place.name; $('#editDate').value=place.date; $('#editNote').value=place.note||''; $('#editDialog').showModal(); }
async function saveDestinationEdit(event) { event.preventDefault(); const button=event.submitter, existing=state.destinations.find(item=>item.id===editingDestinationId); if (!existing) return; button.disabled=true; button.textContent='正在保存…'; try { const name=$('#editName').value.trim(), type=$('#editType').value, location=existing.name===name&&existing.type===type?{name,lat:existing.lat,lng:existing.lng}:await resolveLocation(name,type); run('UPDATE destinations SET name=?, location_type=?, visited_date=?, note=?, lat=?, lng=? WHERE id=?',[location.name,type,$('#editDate').value,$('#editNote').value.trim(),location.lat,location.lng,existing.id]); await persistDatabase(); refreshState(); render(); $('#editDialog').close(); toast(`${location.name} 已更新`); } catch { toast('暂时无法定位该地点，请检查名称或网络。'); } finally { button.disabled=false; button.innerHTML='保存修改 <span>↗</span>'; } }
async function deleteDestination(destinationId) { const place=state.destinations.find(item=>item.id===Number(destinationId)); if (!place) return; const sameTrip=state.destinations.filter(item=>item.tripId===place.tripId); const message=sameTrip.length===1?`删除「${place.name}」？这是${tripCaption(place.tripId)}的最后一个目的地，相关交通段也会删除。`:`删除「${place.name}」？同一次出行中的其他目的地和交通段会保留。`; if (!confirm(message)) return; run('DELETE FROM destinations WHERE id=?',[place.id]); run('DELETE FROM transport_segments WHERE trip_id=?',[place.tripId]); if (sameTrip.length===1) run('DELETE FROM trips WHERE id=?',[place.tripId]); await persistDatabase(); refreshState(); render(); toast(`${place.name} 已从地图移除`); }

document.querySelectorAll('.route-tab').forEach(tab=>tab.addEventListener('click',()=>{ activeLayer=tab.dataset.layer; document.querySelectorAll('.route-tab').forEach(item=>item.classList.toggle('active',item===tab)); renderMapLayers(); }));
document.querySelectorAll('.map-view-button').forEach(button=>button.addEventListener('click',()=>setMapView(button.dataset.mapView)));
window.addEventListener('resize',()=>{ if (mapView === 'globe') resizeGlobe(); });
$('#openAdd').addEventListener('click',()=>{ resetTripForm(); $('#addDialog').showModal(); });
$('#closeAdd').addEventListener('click',()=>$('#addDialog').close());
$('#closeEdit').addEventListener('click',()=>$('#editDialog').close());
$('#addDestinationRow').addEventListener('click',addDestinationRow);
$('#addTransportRow').addEventListener('click',addTransportRow);
$('#destinationRows').addEventListener('click',event=>{ if (!event.target.closest('[data-remove-destination-row]')) return; const row=event.target.closest('.destination-row'); if (document.querySelectorAll('.destination-row').length===1) return toast('一次出行至少需要一个目的地。'); row.remove(); });
$('#transportRows').addEventListener('click',event=>{ if (!event.target.closest('[data-remove-transport-row]')) return; event.target.closest('.transport-row').remove(); if (!document.querySelector('.transport-row')) $('#transportRows').innerHTML='<div class="no-segments">还没有交通段。可按实际出发、转机或换乘顺序逐段添加。</div>'; });
$('#tripForm').addEventListener('submit',saveTrip);
$('#editDestinationForm').addEventListener('submit',saveDestinationEdit);
document.addEventListener('click',event=>{ const edit=event.target.closest('[data-edit-destination]'), remove=event.target.closest('[data-delete-destination]'); if (edit) openEditDestination(edit.dataset.editDestination); if (remove) deleteDestination(remove.dataset.deleteDestination); });
$('#surpriseMe').addEventListener('click',()=>{ if (!state.destinations.length) return $('#openAdd').click(); const place=state.destinations[Math.floor(Math.random()*state.destinations.length)]; maps.world.setView([place.lat,place.lng], 4); $('#atlas').scrollIntoView({behavior:'smooth'}); });
function exportGeoJSON(mode) {
  var label = mode === 'air' ? '航班航迹' : '铁路图';
  var today = new Date().toISOString().slice(0, 10);
  var segments = state.transports.filter(function(s) { return s.transport === mode; });
  var features = segments.map(function(s) {
    return {
      type:'Feature',
      geometry:{ type:'LineString', coordinates:greatCircleArc(s.from, s.to, 80, 0).map(function(p) { return [p[1], p[0]]; }) },
      properties:{ from:s.from.name, to:s.to.name, mode:s.transport, distance_km:s.distance, trip_id:s.tripId }
    };
  });
  var geojson = { type:'FeatureCollection', features:features };
  var blob = new Blob([JSON.stringify(geojson, null, 2)], { type:'application/geo+json' });
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a'); a.href = url; a.download = label + '-' + today + '.geojson';
  document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
  toast(label + '已导出 (' + features.length + ' 段)');
}
$('#exportAir').addEventListener('click', () => exportGeoJSON('air'));
$('#exportRail').addEventListener('click', () => exportGeoJSON('rail'));
async function resetAllData() {
  if (!confirm('确定要清除所有足迹数据吗？此操作不可撤销，所有行程、目的地和交通段将被永久删除。')) return;
  try {
    run('DROP TABLE IF EXISTS transport_segments');
    run('DROP TABLE IF EXISTS destinations');
    run('DROP TABLE IF EXISTS trips');
    createSchema();
    await persistDatabase();
    refreshState();
    render();
    toast('所有数据已清除');
  } catch (error) { toast('清除数据时出错，请重试。'); }
}

$('#resetData').addEventListener('click', resetAllData);

async function purgeOrphanTransports() {
  try {
    const hasTransports = scalar('SELECT COUNT(*) FROM transport_segments');
    if (!Number(hasTransports)) return;
    const orphan = scalar('SELECT COUNT(*) FROM transport_segments WHERE trip_id NOT IN (SELECT trip_id FROM destinations)');
    if (Number(orphan) > 0) {
      run('DELETE FROM transport_segments WHERE trip_id NOT IN (SELECT trip_id FROM destinations)');
      run('DELETE FROM trips WHERE id NOT IN (SELECT trip_id FROM destinations)');
      await persistDatabase();
    }
  } catch (e) { console.warn('清理孤立数据时出错，已跳过:', e); }
}

async function initializeApp() {
  try {
    const SQL = await initSqlJs({ locateFile:file=>`https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.10.3/${file}` });
    idb=await openIndexedDb(); const saved=await getDatabaseBytes(); database=new SQL.Database(saved ? new Uint8Array(saved) : undefined); createSchema(); await migrateLegacyData(); run("UPDATE transport_segments SET mode = 'ship' WHERE mode = 'ferry'"); await purgeOrphanTransports(); await persistDatabase(); refreshState(); createMaps(); render();
  } catch (error) { console.error(error); toast('出错了，按 F12 查看控制台。'); }
}
initializeApp();
