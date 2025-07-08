/**
 * 用户动作跟踪器
 */
class UserActionTracker {
  constructor() {
    this.actions = [];
    this.maxActions = 100;
  }

  /**
   * 记录用户动作
   */
  track(action, data = {}) {
    const timestamp = new Date().toLocaleString();
    const actionEntry = {
      timestamp,
      action,
      data: JSON.parse(JSON.stringify(data)),
      page: getCurrentPages().pop()?.route || 'unknown'
    };
    
    this.actions.unshift(actionEntry);
    
    if (this.actions.length > this.maxActions) {
      this.actions = this.actions.slice(0, this.maxActions);
    }
    
    // 用户动作记录
    
    // 存储到本地
    try {
      wx.setStorageSync('userActions', this.actions);
    } catch (error) {
      console.warn('保存用户动作失败:', error);
    }
  }

  /**
   * 获取最近的动作
   */
  getRecentActions(count = 10) {
    return this.actions.slice(0, count);
  }

  /**
   * 导出动作日志
   */
  exportActions() {
    const header = '时间\t页面\t动作\t数据\n';
    const rows = this.actions.map(action => {
      return [
        action.timestamp,
        action.page,
        action.action,
        JSON.stringify(action.data)
      ].join('\t');
    }).join('\n');
    
    return header + rows;
  }
}

const userActionTracker = new UserActionTracker();

module.exports = userActionTracker; 