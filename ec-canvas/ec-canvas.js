import WxCanvas from './wx-canvas';
import * as echarts from './echarts';

let ctx;

function compareVersion(v1, v2) {
  v1 = v1.split('.')
  v2 = v2.split('.')
  const len = Math.max(v1.length, v2.length)

  while (v1.length < len) {
    v1.push('0')
  }
  while (v2.length < len) {
    v2.push('0')
  }

  for (let i = 0; i < len; i++) {
    const num1 = parseInt(v1[i])
    const num2 = parseInt(v2[i])

    if (num1 > num2) {
      return 1
    } else if (num1 < num2) {
      return -1
    }
  }
  return 0
}

Component({
  properties: {
    canvasId: {
      type: String,
      value: 'ec-canvas'
    },

    ec: {
      type: Object
    },

    forceUseOldCanvas: {
      type: Boolean,
      value: false
    }
  },

  data: {
    isUseNewCanvas: false
  },

  ready: function () {
    // Disable prograssive because drawImage doesn't support DOM as parameter
    // See https://developers.weixin.qq.com/miniprogram/dev/api/canvas/CanvasContext.drawImage.html
    echarts.registerPreprocessor(option => {
      if (option && option.series) {
        if (option.series.length > 0) {
          option.series.forEach(series => {
            series.progressive = 0;
            // 默认设置动画平滑和速度
            if (series.type === 'line' && series.animation !== false) {
              series.animation = true;
              series.animationDuration = series.animationDuration || 300;
              series.animationEasing = series.animationEasing || 'linear';
            }
          });
        }
        else if (typeof option.series === 'object') {
          option.series.progressive = 0;
          // 对单个series对象也应用动画设置
          if (option.series.type === 'line' && option.series.animation !== false) {
            option.series.animation = true;
            option.series.animationDuration = option.series.animationDuration || 300;
            option.series.animationEasing = option.series.animationEasing || 'linear';
          }
        }
      }
      
      // 优化文字渲染，解决真机模糊问题
      if (option && option.tooltip) {
        if (!option.tooltip.textStyle) {
          option.tooltip.textStyle = {};
        }
        option.tooltip.textStyle.textShadowBlur = 0;
        option.tooltip.textStyle.textShadowColor = 'transparent';
      }
      
      // 优化渲染性能
      if (option && option.animation !== false) {
        option.animation = true;
        option.animationDuration = option.animationDuration || 300;
        option.animationEasing = option.animationEasing || 'cubicOut';
      }
    });

    if (!this.data.ec) {
      console.warn('组件需绑定 ec 变量，例：<ec-canvas id="mychart-dom-bar" '
        + 'canvas-id="mychart-bar" ec="{{ ec }}"></ec-canvas>');
      return;
    }

    if (!this.data.ec.lazyLoad) {
      this.init();
    }
  },

  methods: {
    init: function (callback) {
      const version = wx.getAppBaseInfo().SDKVersion

      const canUseNewCanvas = compareVersion(version, '2.9.0') >= 0;
      const forceUseOldCanvas = this.data.forceUseOldCanvas;
      const isUseNewCanvas = canUseNewCanvas && !forceUseOldCanvas;
      this.setData({ isUseNewCanvas });

      if (forceUseOldCanvas && canUseNewCanvas) {
        console.warn('开发者强制使用旧canvas,建议关闭');
      }

      if (isUseNewCanvas) {
        // console.log('微信基础库版本大于2.9.0，开始使用<canvas type="2d"/>');
        // 2.9.0 可以使用 <canvas type="2d"></canvas>
        this.initByNewWay(callback);
      } else {
        const isValid = compareVersion(version, '1.9.91') >= 0
        if (!isValid) {
          console.error('微信基础库版本过低，需大于等于 1.9.91。'
            + '参见：https://github.com/ecomfe/echarts-for-weixin'
            + '#%E5%BE%AE%E4%BF%A1%E7%89%88%E6%9C%AC%E8%A6%81%E6%B1%82');
          return;
        } else {
          console.warn('建议将微信基础库调整大于等于2.9.0版本。升级后绘图将有更好性能');
          this.initByOldWay(callback);
        }
      }
    },

    initByOldWay(callback) {
      // 1.9.91 <= version < 2.9.0：原来的方式初始化
      ctx = wx.createCanvasContext(this.data.canvasId, this);
      
      // 真机专用的高清适配方案
      const canvasDpr = (() => {
        try {
          // 方案1：优先使用wx.getSystemInfoSync()
          const systemInfo = wx.getSystemInfoSync();
          if (systemInfo.pixelRatio && systemInfo.pixelRatio > 0) {
            return systemInfo.pixelRatio;
          }
          
          // 方案2：使用wx.getDeviceInfo()
          const deviceInfo = wx.getDeviceInfo();
          if (deviceInfo.pixelRatio && deviceInfo.pixelRatio > 0) {
            return deviceInfo.pixelRatio;
          }
          
          // 方案3：真机常见DPR值
          return 2.75; // 根据实际设备测试结果
        } catch (e) {
          console.warn('获取设备像素比失败，使用默认值2.75（真机优化）:', e);
          return 2.75;
        }
      })()

      
      const canvas = new WxCanvas(ctx, this.data.canvasId, false);

      if (echarts.setPlatformAPI) {
        echarts.setPlatformAPI({
          createCanvas: () => canvas,
        });
      } else {
        echarts.setCanvasCreator(() => canvas);
      };
      
      var query = wx.createSelectorQuery().in(this);
      query.select('.ec-canvas').boundingClientRect(res => {
        // 旧版Canvas也应用DPR缩放以提高清晰度
        ctx.scale(canvasDpr, canvasDpr);
        
        if (typeof callback === 'function') {
          this.chart = callback(canvas, res.width, res.height, canvasDpr);
        }
        else if (this.data.ec && typeof this.data.ec.onInit === 'function') {
          this.chart = this.data.ec.onInit(canvas, res.width, res.height, canvasDpr);
        }
        else {
          this.triggerEvent('init', {
            canvas: canvas,
            width: res.width,
            height: res.height,
            canvasDpr: canvasDpr // 增加了dpr，可方便外面echarts.init
          });
        }
      }).exec();
    },

    initByNewWay(callback) {
      // version >= 2.9.0：使用新的方式初始化
      const query = wx.createSelectorQuery().in(this)
      query
        .select('.ec-canvas')
        .fields({ node: true, size: true })
        .exec(res => {
          // 确保获取到了有效的canvas节点
          if (!res || !res[0] || !res[0].node) {
            console.error('无法获取canvas节点，重试初始化');
            setTimeout(() => {
              this.initByNewWay(callback);
            }, 100);
            return;
          }
          
          const canvasNode = res[0].node
          this.canvasNode = canvasNode

          // 真机专用的高清适配方案
          const canvasDpr = (() => {
            try {
              // 方案1：优先使用wx.getSystemInfoSync()
              const systemInfo = wx.getSystemInfoSync();
              if (systemInfo.pixelRatio && systemInfo.pixelRatio > 0) {
                return systemInfo.pixelRatio;
              }
              
              // 方案2：使用wx.getDeviceInfo()
              const deviceInfo = wx.getDeviceInfo();
              if (deviceInfo.pixelRatio && deviceInfo.pixelRatio > 0) {
                return deviceInfo.pixelRatio;
              }
              
              // 方案3：真机常见DPR值（避免不准确的屏幕尺寸推算）
              return 2.75; // 根据实际设备测试优化的默认值
            } catch (e) {
              console.warn('获取设备像素比失败，使用默认值2.75:', e);
              return 2.75;
            }
          })()

          const canvasWidth = res[0].width
          const canvasHeight = res[0].height

          // 验证canvas节点和尺寸信息
          if (!canvasNode || typeof canvasNode.getContext !== 'function') {
            console.error('canvas节点无效或不支持getContext');
            return;
          }
          
          if (!canvasWidth || !canvasHeight || canvasWidth <= 0 || canvasHeight <= 0) {
            console.error('canvas尺寸无效:', { canvasWidth, canvasHeight });
            return;
          }

          // 真机专用：更激进的高清适配
          const physicalWidth = canvasWidth * canvasDpr
          const physicalHeight = canvasHeight * canvasDpr
          
          try {
            // 安全地设置canvas物理尺寸
            canvasNode.width = physicalWidth
            canvasNode.height = physicalHeight
            
            // 设置CSS样式尺寸保持逻辑尺寸
            if (canvasNode.style) {
              canvasNode.style.width = canvasWidth + 'px'
              canvasNode.style.height = canvasHeight + 'px'
            }
            

          } catch (e) {
            console.error('设置canvas尺寸失败:', e);
            return;
          }

          const ctx = canvasNode.getContext('2d')
          if (!ctx) {
            console.error('无法获取2d上下文');
            return;
          }
          
          // 缩放canvas上下文
          try {
            ctx.scale(canvasDpr, canvasDpr)
          } catch (e) {
            console.error('缩放canvas上下文失败:', e);
          }
          
          // 真机专用：强制启用高质量渲染
          try {
            if (typeof ctx.imageSmoothingEnabled !== 'undefined') {
              ctx.imageSmoothingEnabled = true
            }
            if (typeof ctx.imageSmoothingQuality !== 'undefined') {
              ctx.imageSmoothingQuality = 'high'
            }
            if (typeof ctx.textRenderingOptimization !== 'undefined') {
              ctx.textRenderingOptimization = 'optimizeQuality'
            }
          } catch (e) {
            console.log('部分渲染优化API不支持:', e)
          }

          const canvas = new WxCanvas(ctx, this.data.canvasId, true, canvasNode)
          if (echarts.setPlatformAPI) {
            echarts.setPlatformAPI({
              createCanvas: () => canvas,
              loadImage: (src, onload, onerror) => {
                if (canvasNode.createImage) {
                  const image = canvasNode.createImage();
                  image.onload = onload;
                  image.onerror = onerror;
                  image.src = src;
                  return image;
                }
                console.error('加载图片依赖 `Canvas.createImage()` API，要求小程序基础库版本在 2.7.0 及以上。');
                // PENDING fallback?
              }
            })
          } else {
            echarts.setCanvasCreator(() => canvas)
          }

          if (typeof callback === 'function') {
            this.chart = callback(canvas, canvasWidth, canvasHeight, canvasDpr)
          } else if (this.data.ec && typeof this.data.ec.onInit === 'function') {
            this.chart = this.data.ec.onInit(canvas, canvasWidth, canvasHeight, canvasDpr)
          } else {
            this.triggerEvent('init', {
              canvas: canvas,
              width: canvasWidth,
              height: canvasHeight,
              dpr: canvasDpr
            })
          }
        })
    },
    
    // 获取当前的图表实例
    getChart() {
      return this.chart;
    },

    // 更新图表数据方法，方便外部调用
    updateChart(option) {
      if (this.chart) {
        this.chart.setOption(option);
      }
    },
    
    canvasToTempFilePath(opt) {
      if (this.data.isUseNewCanvas) {
        // 新版
        const query = wx.createSelectorQuery().in(this)
        query
          .select('.ec-canvas')
          .fields({ node: true, size: true })
          .exec(res => {
            const canvasNode = res[0].node
            opt.canvas = canvasNode
            wx.canvasToTempFilePath(opt)
          })
      } else {
        // 旧的
        if (!opt.canvasId) {
          opt.canvasId = this.data.canvasId;
        }
        ctx.draw(true, () => {
          wx.canvasToTempFilePath(opt, this);
        });
      }
    },

    touchStart(e) {
      if (this.chart && e.touches.length > 0) {
        var touch = e.touches[0];
        var handler = this.chart.getZr().handler;
        handler.dispatch('mousedown', {
          zrX: touch.x,
          zrY: touch.y,
          preventDefault: () => {},
          stopImmediatePropagation: () => {},
          stopPropagation: () => {}
        });
        handler.dispatch('mousemove', {
          zrX: touch.x,
          zrY: touch.y,
          preventDefault: () => {},
          stopImmediatePropagation: () => {},
          stopPropagation: () => {}
        });
        handler.processGesture(wrapTouch(e), 'start');
      }
    },

    touchMove(e) {
      if (this.chart && e.touches.length > 0) {
        var touch = e.touches[0];
        var handler = this.chart.getZr().handler;
        handler.dispatch('mousemove', {
          zrX: touch.x,
          zrY: touch.y,
          preventDefault: () => {},
          stopImmediatePropagation: () => {},
          stopPropagation: () => {}
        });
        handler.processGesture(wrapTouch(e), 'change');
      }
    },

    touchEnd(e) {
      if (this.chart) {
        const touch = e.changedTouches ? e.changedTouches[0] : {};
        var handler = this.chart.getZr().handler;
        handler.dispatch('mouseup', {
          zrX: touch.x,
          zrY: touch.y,
          preventDefault: () => {},
          stopImmediatePropagation: () => {},
          stopPropagation: () => {}
        });
        handler.dispatch('click', {
          zrX: touch.x,
          zrY: touch.y,
          preventDefault: () => {},
          stopImmediatePropagation: () => {},
          stopPropagation: () => {}
        });
        handler.processGesture(wrapTouch(e), 'end');
      }
    }
  }
});

function wrapTouch(event) {
  for (let i = 0; i < event.touches.length; ++i) {
    const touch = event.touches[i];
    touch.offsetX = touch.x;
    touch.offsetY = touch.y;
  }
  return event;
}
