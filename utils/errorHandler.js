/**
 * 统一错误处理工具
 * 提供一致的错误处理和用户提示
 */

// 云存储错误码映射
const STORAGE_ERROR_CODES = {
  'STORAGE_EXCEED_AUTHORITY': {
    title: '文件访问权限不足',
    message: '无法访问该文件，可能是权限设置问题',
    suggestion: '请检查文件权限设置或稍后重试'
  },
  'STORAGE_FILE_NONEXIST': {
    title: '文件不存在',
    message: '请求的文件不存在或已被删除',
    suggestion: '请刷新页面重试'
  },
  'STORAGE_REQUEST_FAIL': {
    title: '存储请求失败',
    message: '云存储服务暂时不可用',
    suggestion: '请检查网络连接并重试'
  }
};

class ErrorHandler {
  /**
   * 处理云函数调用错误
   * @param {Error} error - 错误对象
   * @param {string} operation - 操作名称
   * @param {boolean} showToast - 是否显示提示
   */
  static handleCloudError(error, operation = '操作', showToast = true) {
    console.error(`${operation}失败:`, error);
    
    let message = '网络异常，请稍后重试';
    
    // 根据错误类型提供具体提示
    if (error.errCode) {
      switch (error.errCode) {
        case -1:
          message = '网络连接失败，请检查网络设置';
          break;
        case -501001:
          message = '云函数调用失败，请稍后重试';
          break;
        case -501002:
          message = '云函数超时，请稍后重试';
          break;
        default:
          message = error.errMsg || message;
      }
    } else if (error.message) {
      message = error.message;
    }

    if (showToast) {
      wx.showToast({
        title: message,
        icon: 'error',
        duration: 3000
      });
    }

    return {
      success: false,
      error: message,
      originalError: error
    };
  }

  /**
   * 处理数据验证错误
   * @param {Object} validationResult - 验证结果
   * @param {boolean} showToast - 是否显示提示
   */
  static handleValidationError(validationResult, showToast = true) {
    if (!validationResult.isValid) {
      if (showToast) {
        wx.showToast({
          title: validationResult.error,
          icon: 'error',
          duration: 2000
        });
      }
      return false;
    }

    // 显示警告信息
    if (validationResult.warnings && validationResult.warnings.length > 0) {
      if (showToast) {
        wx.showModal({
          title: '提示',
          content: validationResult.warnings.join('\n'),
          showCancel: false
        });
      }
    }

    return true;
  }

  /**
   * 处理交易错误
   * @param {string} type - 交易类型
   * @param {string} error - 错误信息
   */
  static handleTransactionError(type, error) {
    const typeMap = {
      'buy': '买入',
      'sell': '卖出'
    };

    const operation = typeMap[type] || '交易';
    
    wx.showModal({
      title: `${operation}失败`,
      content: error,
      showCancel: false,
      confirmText: '我知道了'
    });
  }

  /**
   * 处理数据加载错误
   * @param {Error} error - 错误对象
   * @param {Function} retryCallback - 重试回调函数
   */
  static handleDataLoadError(error, retryCallback = null) {
    console.error('数据加载失败:', error);
    
    const options = {
      title: '数据加载失败',
      content: '无法加载投资数据，请检查网络连接',
      confirmText: '重试'
    };

    if (retryCallback) {
      options.success = (res) => {
        if (res.confirm) {
          retryCallback();
        }
      };
    } else {
      options.showCancel = false;
    }

    wx.showModal(options);
  }

  /**
   * 记录错误日志
   * @param {string} module - 模块名称
   * @param {string} action - 操作名称
   * @param {Error} error - 错误对象
   * @param {Object} context - 上下文信息
   */
  static logError(module, action, error, context = {}) {
    const errorLog = {
      timestamp: new Date().toISOString(),
      module,
      action,
      error: {
        message: error.message,
        stack: error.stack,
        code: error.errCode
      },
      context,
      userAgent: (() => {
        try {
          return wx.getDeviceInfo();
        } catch (e) {
          return 'unknown';
        }
      })()
    };

    console.error('Error Log:', errorLog);
    
    // 可以在这里添加错误上报逻辑
    // this.reportError(errorLog);
  }

  /**
   * 显示成功提示
   * @param {string} message - 成功信息
   * @param {number} duration - 显示时长
   */
  static showSuccess(message, duration = 2000) {
    wx.showToast({
      title: message,
      icon: 'success',
      duration
    });
  }

  /**
   * 显示加载提示
   * @param {string} message - 加载信息
   */
  static showLoading(message = '加载中...') {
    wx.showLoading({
      title: message,
      mask: true
    });
  }

  /**
   * 隐藏加载提示
   */
  static hideLoading() {
    wx.hideLoading();
  }

  /**
   * 处理云存储错误
   * @param {Object} error - 错误对象
   * @param {string} context - 错误上下文
   * @returns {Object} 处理后的错误信息
   */
  static handleStorageError(error, context = '') {
    console.error(`[云存储错误${context ? ' - ' + context : ''}]:`, error);
    
    // 提取错误码
    let errorCode = '';
    if (error.errMsg) {
      const match = error.errMsg.match(/([A-Z_]+)/);
      errorCode = match ? match[1] : '';
    } else if (error.code) {
      errorCode = error.code;
    }
    
    // 查找错误信息
    const errorInfo = STORAGE_ERROR_CODES[errorCode] || {
      title: '操作失败',
      message: '发生未知错误',
      suggestion: '请稍后重试'
    };
    
    return {
      code: errorCode,
      title: errorInfo.title,
      message: errorInfo.message,
      suggestion: errorInfo.suggestion,
      originalError: error
    };
  }
  
  /**
   * 显示用户友好的错误提示
   * @param {Object} error - 错误对象
   * @param {string} context - 错误上下文
   */
  static showStorageError(error, context = '') {
    const errorInfo = this.handleStorageError(error, context);
    
    wx.showModal({
      title: errorInfo.title,
      content: `${errorInfo.message}\n${errorInfo.suggestion}`,
      showCancel: false,
      confirmText: '我知道了'
    });
  }
  
  /**
   * 处理图片加载错误
   * @param {string} imageUrl - 图片URL
   * @param {Function} fallbackCallback - 回调函数
   */
  static handleImageError(imageUrl, fallbackCallback) {
    console.warn('图片加载失败:', imageUrl);
    
    // 提供默认头像
    const defaultAvatar = '/images/default-avatar.png';
    if (fallbackCallback) {
      fallbackCallback(defaultAvatar);
    }
    
    return defaultAvatar;
  }
  
  /**
   * 重试机制
   * @param {Function} asyncFunc - 异步函数
   * @param {number} maxRetries - 最大重试次数
   * @param {number} delay - 重试延迟
   */
  static async retry(asyncFunc, maxRetries = 3, delay = 1000) {
    for (let i = 0; i < maxRetries; i++) {
      try {
        return await asyncFunc();
      } catch (error) {
        console.warn(`第${i + 1}次重试失败:`, error);
        
        if (i === maxRetries - 1) {
          throw error; // 最后一次重试失败，抛出错误
        }
        
        // 等待后重试
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
}

module.exports = ErrorHandler; 