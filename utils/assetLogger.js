/**
 * 总资产计算日志工具
 */
class AssetLogger {
  constructor() {
    this.logs = [];
    this.maxLogs = 50; // 最多保存50条日志
  }

  /**
   * 记录总资产计算日志
   */
  log(context, data) {
    const timestamp = new Date().toLocaleString();
    const logEntry = {
      timestamp,
      context,
      data: JSON.parse(JSON.stringify(data)) // 深拷贝避免引用问题
    };
    
    this.logs.unshift(logEntry);
    
    // 保持日志数量在限制内
    if (this.logs.length > this.maxLogs) {
      this.logs = this.logs.slice(0, this.maxLogs);
    }
    

    
    // 存储到本地（可选）
    try {
      wx.setStorageSync('assetCalculationLogs', this.logs);
    } catch (error) {
      console.warn('保存日志到本地存储失败:', error);
    }
  }

  /**
   * 对比投资页面和排名页面的总资产
   * @param {number} investmentPageAssets - 投资页面总资产
   * @param {number} rankingPageAssets - 排名页面总资产
   * @param {Object} userInfo - 用户信息
   */
  compare(investmentPageAssets, rankingPageAssets, userInfo = {}) {
    const timestamp = new Date().toLocaleString();
    const difference = Math.abs(investmentPageAssets - rankingPageAssets);
    const percentageDiff = rankingPageAssets > 0 ? (difference / rankingPageAssets * 100) : 0;
    
    // 判断是否存在显著差异（超过1元或0.1%）
    const hasSignificantDifference = difference > 1 || percentageDiff > 0.1;
    
    const comparisonResult = {
      timestamp,
      userInfo,
      investmentPage: investmentPageAssets,
      rankingPage: rankingPageAssets,
      difference,
      percentageDiff: percentageDiff.toFixed(4),
      status: hasSignificantDifference ? '不一致' : '一致',
      isSignificant: hasSignificantDifference,
      threshold: {
        amountThreshold: 1,
        percentageThreshold: 0.1
      }
    };
    
    // 根据差异程度输出不同级别的日志
    if (hasSignificantDifference) {
      console.warn('🚨 总资产存在显著差异:', comparisonResult);
    }
    
    this.log('总资产对比', comparisonResult);
    
    return comparisonResult;
  }

  /**
   * 上报资产计算差异
   */
  reportDiscrepancy(comparisonLog) {
    try {
      // 这里可以调用云函数上报问题
      wx.cloud.callFunction({
        name: 'reportAssetDiscrepancy',
        data: {
          log: comparisonLog,
          deviceInfo: (() => {
            try {
              return wx.getDeviceInfo();
            } catch (e) {
              return { model: 'unknown', platform: 'unknown' };
            }
          })(),
          appVersion: getApp().globalData.version || 'unknown'
        }
      }).catch(error => {
        console.error('上报资产差异失败:', error);
      });
    } catch (error) {
      console.error('上报资产差异出错:', error);
    }
  }

  /**
   * 获取所有日志
   */
  getLogs() {
    return this.logs;
  }

  /**
   * 清空日志
   */
  clearLogs() {
    this.logs = [];
    try {
      wx.removeStorageSync('assetCalculationLogs');
    } catch (error) {
      console.warn('清除本地日志失败:', error);
    }
  }

  /**
   * 导出日志为可读格式
   */
  exportLogs() {
    const header = '时间\t页面\t现金\t份额\t净值\t基金市值\t总资产\t备注\n';
    const rows = this.logs.map(log => {
      const data = log.data;
      return [
        log.timestamp,
        log.context,
        data.cash || '',
        data.fundUnits || '',
        data.currentNetValue || '',
        data.fundValue || '',
        data.totalAssets || '',
        JSON.stringify(data)
      ].join('\t');
    }).join('\n');
    
    return header + rows;
  }
}

// 创建全局实例
const assetLogger = new AssetLogger();

module.exports = assetLogger; 