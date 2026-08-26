# 改动记录

## 1. 简化行程输入（出行日期统一填写）

**文件:** `index.html` `app.js` `styles.css`

之前：每个目的地行都需要单独填写日期。  
之后：弹窗顶部设一个"出行日期"字段，整次出行只填一次，所有目的地共用。打开弹窗时默认填入当月。单个目的地的日期仍可在编辑弹窗中修改。

- 弹窗新增 `<input id="tripDate" type="month">`，hint 更新
- `resetTripForm()` 初始化 `#tripDate` 为当前月份
- `saveTrip()` 从 `#tripDate` 读取日期，写入所有 destination
- 目的地行去掉日期字段，CSS grid 从 5 列改为 4 列

## 2. 出发次数统计修正

**文件:** `app.js`

"次出发"之前统计的是交通段（transports）数量，改为统计行程（trips）数量。

```js
// 之前
$('#yearTrips').textContent = number(state.transports.length);
// 之后
$('#yearTrips').textContent = number(state.trips.length);
```

## 3. 精简页面结构

**文件:** `index.html` `app.js`

只保留"足迹地图"和"足迹总览"两个板块。去掉导航和页面中的"旅行手记""城市收藏"，删除 `renderMemories()`。

## 4. 合并为单一世界地图

**文件:** `index.html` `app.js`

去掉中国/世界地图切换和 china-map 面板，所有足迹标记和交通航迹都在同一张世界地图上呈现。`maps` 和 `layers` 对象简化为只保留 `world`，`renderFootprintMarkers()` 和 `renderRoutes()` 不再区分 china/world 目标地图。"随机一站"按钮直接操作 `maps.world`。地图角标改为同时展示城市和国家数量。

## 5. 修复中文名外国城市的地理定位

**文件:** `app.js`

`resolveLocation()` 中，当 `type === 'china'` 时会在搜索词后追加 `, China`。而 `citySearchType()` 仅凭是否包含中文字符就判定 `type`，导致输入"仰光"这类中文名称的外国城市时，Nominatim 被误导搜到中国境内的同名或近似地点。

修复：去掉 `, China` 后缀，直接用原始名称去 Nominatim 搜索。

## 6. 修复交通段定位并增加国家范围限制

**文件:** `app.js`

问题的延续："普吉""曼谷"等中文名的外国城市，Nominatim 还是可能搜偏。这次做了三层加固：

- `KNOWN_LOCATIONS` 扩充了常用外国城市的中文名坐标：曼谷、普吉、清迈、仰光、河内、胡志明、吉隆坡、巴厘岛、暹粒、雅加达
- 新增 `COUNTRY_CODES` 映射，把目的地国家名映射为 ISO 3166-1 alpha-2 代码
- `resolveLocation` 新增 `countryCodes` 参数，传给 Nominatim 的 `countrycodes` 过滤器，限制只在这些国家内搜索
- `saveTrip` 中，从本次出行的目的地列表提取国家代码，传给每个交通段的定位请求

## 7. 航迹线改为大圆光滑曲线

**文件:** `app.js`

之前的 `curvedLine` 只有 3 个控制点（起点、中点偏移、终点），跨洲航班看起来像折线。改为 `greatCircleArc`：

- 沿球面大圆采样 64 个点
- 叠加与距离成比例、沿法线方向的隆起偏移，使弧线在地图上自然隆起
- 跨日期变更线时正确处理经度环绕
- 箭头标记放在曲线中点

## 8. 导出 GeoJSON

**文件:** `index.html` `app.js` `styles.css`

在地图图层切换栏右侧添加"导出航迹"和"导出铁路"两个按钮。点击时将当前数据转为 GeoJSON FeatureCollection（LineString 坐标使用大圆弧采样点），通过 Blob 下载。文件名格式：`航班航迹-2026-08-06.geojson`。

## 9. 重置数据

**文件:** `index.html` `app.js` `styles.css`

在页脚加"重置数据"按钮，点击后二次确认，清空所有 trip / destination / transport 表重建 schema，解决错误数据残留问题。

## 10. 省份/国家边界描边涂色

**文件:** `app.js`

- 新增 `CITY_PROVINCE` 映射，记录中国城市对应的省份
- 加载阿里 DataV 中国省份 GeoJSON，到访省份用 `#d36b45` 描边 + `#e8b854` 半透填充，未到访省份用淡色显示完整边界
- 国家边界从 `world.geojson` 加载，到访国家高亮，未到访国家淡色
- province/country 图层放到 tile 层之上、标记点之下，确保可见
- 图层切换时不清除边界（`renderProvinceLayer` / `renderCountryLayer` 在切换时不再 return）

## 11. 删除目的地同步清理关联交通段

**文件:** `app.js`

`deleteDestination` 删除目的地时，同步 `DELETE FROM transport_segments` 删除该行程下的所有交通段，避免残留航线。

## 12. 启动时自动清理孤儿交通段

**文件:** `app.js`

新增 `purgeOrphanTransports()`，在 `initializeApp` 初始化流程中（`createMaps` 之前）执行，删除所有没有对应目的地的孤立交通段和空行程。历史错误数据会自动清除。

## 13. 修复大圆弧曲线弯曲幅度

**文件:** `app.js`

`greatCircleArc` 的 `bulge` 系数从 `distKm / 15000`（几乎不可见）改为 `distKm / 3000`，短途微拱、长途明显隆起。跨度从 0~1.1 改为 0.25~1.6，确保所有跨洲航线都有可见弧度。

**后续再改：** 用球面线性插值（slerp）沿大圆采样 64 个点，生成完全贴合地球表面的弧线，不再有人为偏移。在墨卡托投影中曲率自然合理，不会过度弯曲。

**补充：** `renderRoutes` 按起点-终点名称分组，同一条航线上有多段时（多次往返），每段沿大圆法线方向偏移 0.28°/条间距，不再重叠。同时修复了 `sinOmega` 过小（两点极近）时法向量未初始化导致偏移计算出 NaN 的问题。

**进一步修复：** 彻底重写 `greatCircleArc`：

- 用法向量 = 起点向量 × 终点向量（标准交叉积）替代之前拼凑的错误公式
- 罗德里格旋转的旋转轴是单位法向量，用 `nMag` 归一化
- 当两点对径（nMag ≈ 0）时退化为线性插值
- cosD 做 `clamp(-1,1)` 防 `Math.acos` NaN
- 默认参数改用 `typeof === 'undefined'` 检查，避免在某些压缩环境下 ES6 默认值不生效

**补充再修：** `greatCircleArc` 签名兼容所有调用方（`renderRoutes` 传 4 参，`exportGeoJSON` 传 2 参）。`nMag` 用作旋转轴归一化。acos 前 clamp cosD 到 [-1,1] 防 NaN。`renderRoutes` 内同组段数 >1 时才偏移。

## 16. 航线/铁路曲线重构 (第4版)

**文件:** `app.js`

放弃所有绕切线/绕法向量的旋转方案，改为极简正弦偏移：

**曲线生成 (`greatCircleArc`)**
- slerp 沿大圆采样 80 点
- 偏移沿大圆法向量在球面切平面上的投影方向
- 偏移幅值 = `sin(π·t) × bulge`，在中点达到峰值
- 正向 bulge（去程）往 +n 凸，负向 bulge（回程）往 -n 凸
- 不再做罗德里格旋转，只做单位球面上的线性推动：`p' = p·cos(amp) + d·sin(amp)`

**往返分离 (`renderRoutes`)**
- 检测 A||B 配对下有两个方向键 → 自动设 +1.8° / -1.8°
- 同向多次额外 spread ±0.5°
**修复(hotfix):** 偏移方向从"法向量投影到切面"改为直接用 `p × n`（位置向量叉积大圆法向量），方向始终垂直于大圆。之前 `unX - dot*pX` 的投影在接近大圆平面时趋近零从而无偏移，现在用纯切向可分离 1.4°。

## 14. 修复初始化崩溃

**文件:** `app.js`

- `bringToBack()` 不是 Leaflet LayerGroup 的方法，删除所有调用。边界图层通过在 `createMaps` 中先 `addTo` 来保证在底层。
- `purgeOrphanTransports()` 内部不再调用 `render()` / `refreshState()`，避免在 `createMaps` 之前触发渲染导致访问未初始化的 `layers`。

## 15. toast 提示不被对话框遮挡

**文件:** `styles.css` `app.js`

- toast z-index 从 30 升至 9999，确保在 `<dialog>` backdrop 之上
- `saveTrip` 出错时先 `$('#addDialog').close()` 关闭对话框，再显示 toast
- 清理 lint 残留的 `.toast-override` 规则，footer 改用 padding 替代固定高度
- 修复 `$('#resetData').addEventListener` 被 lint 误合并，回调丢失
