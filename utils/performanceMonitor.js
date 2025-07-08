/**
 * 性能监控工具
 * 监控关键操作的性能指标
 */

class PerformanceMonitor {
  constructor() {
    this.timers = new Map();
    this.metrics = new Map();
  }

  /**
   * 开始计时
   * @param {string} label - 计时标签
   */
  startTimer(label) {
    this.timers.set(label, Date.now());
  }

  /**
   * 结束计时并记录
   * @param {string} label - 计时标签
   * @returns {number} 耗时（毫秒）
   */
  endTimer(label) {
    const startTime = this.timers.get(label);
    if (!startTime) {
      console.warn(`Timer ${label} not found`);
      return 0;
    }

    const duration = Date.now() - startTime;
    this.timers.delete(label);
    
    // 记录到指标中
    this.recordMetric(label, duration);
    
    return duration;
  }

  /**
   * 记录指标
   * @param {string} name - 指标名称
   * @param {number} value - 指标值
   */
  recordMetric(name, value) {
    if (!this.metrics.has(name)) {
      this.metrics.set(name, []);
    }
    
    const values = this.metrics.get(name);
    values.push({
      value,
      timestamp: Date.now()
    });

    // 只保留最近100条记录
    if (values.length > 100) {
      values.shift();
    }
  }

  /**
   * 获取指标统计
   * @param {string} name - 指标名称
   * @returns {Object} 统计信息
   */
  getMetricStats(name) {
    const values = this.metrics.get(name);
    if (!values || values.length === 0) {
      return null;
    }

    const nums = values.map(v => v.value);
    const sum = nums.reduce((a, b) => a + b, 0);
    const avg = sum / nums.length;
    const min = Math.min(...nums);
    const max = Math.max(...nums);

    return {
      count: nums.length,
      average: avg,
      min,
      max,
      total: sum
    };
  }

  /**
   * 监控函数执行性能
   * @param {Function} fn - 要监控的函数
   * @param {string} label - 监控标签
   * @returns {Function} 包装后的函数
   */
  wrapFunction(fn, label) {
    return (...args) => {
      this.startTimer(label);
      
      try {
        const result = fn.apply(this, args);
        
        // 如果是Promise，等待完成后记录时间
        if (result && typeof result.then === 'function') {
          return result.finally(() => {
            this.endTimer(label);
          });
        } else {
          this.endTimer(label);
          return result;
        }
      } catch (error) {
        this.endTimer(label);
        throw error;
      }
    };
  }

  /**
   * 监控页面渲染性能
   * @param {Object} page - 页面实例
   */
  monitorPagePerformance(page) {
    const originalOnLoad = page.onLoad;
    const originalOnShow = page.onShow;
    const originalSetData = page.setData;

    // 监控页面加载时间
    page.onLoad = function(...args) {
      const monitor = getPerformanceMonitor();
      monitor.startTimer('page_load');
      
      if (originalOnLoad) {
        const result = originalOnLoad.apply(this, args);
        
        // 在下一个tick记录加载完成时间
        setTimeout(() => {
          monitor.endTimer('page_load');
        }, 0);
        
        return result;
      }
    };

    // 监控页面显示时间
    page.onShow = function(...args) {
      const monitor = getPerformanceMonitor();
      monitor.startTimer('page_show');
      
      if (originalOnShow) {
        const result = originalOnShow.apply(this, args);
        
        setTimeout(() => {
          monitor.endTimer('page_show');
        }, 0);
        
        return result;
      }
    };

    // 监控setData性能
    page.setData = function(data, callback) {
      const monitor = getPerformanceMonitor();
      monitor.startTimer('setData');
      
      const dataSize = JSON.stringify(data).length;
      monitor.recordMetric('setData_size', dataSize);
      
      return originalSetData.call(this, data, () => {
        monitor.endTimer('setData');
        if (callback) callback();
      });
    };
  }

  /**
   * 获取性能报告
   * @returns {Object} 性能报告
   */
  getPerformanceReport() {
    const report = {
      timestamp: new Date().toISOString(),
      metrics: {}
    };

    for (const [name, values] of this.metrics) {
      report.metrics[name] = this.getMetricStats(name);
    }

    return report;
  }

  /**
   * 清除所有指标
   */
  clear() {
    this.timers.clear();
    this.metrics.clear();
  }

  /**
   * 输出性能报告到控制台
   */
  logReport() {
    // 性能监控报告功能已简化
  }
}

// 全局实例
let globalMonitor = null;

/**
 * 获取全局性能监控实例
 * @returns {PerformanceMonitor}
 */
function getPerformanceMonitor() {
  if (!globalMonitor) {
    globalMonitor = new PerformanceMonitor();
  }
  return globalMonitor;
}

module.exports = {
  PerformanceMonitor,
  getPerformanceMonitor
}; 