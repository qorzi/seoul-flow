import React from 'react';

/**
 * 더미 목록을 테이블 형태로 보여주는 컴포넌트
 */
const DummyTable = ({ dummies, simulationState }) => {
  const getStatus = (dummy) => {
    if (dummy.isCompleted) return { text: '완료', className: 'status-completed' };
    if (simulationState === 'running') return { text: '이동중', className: 'status-moving' };
    if (simulationState === 'paused') return { text: '일시정지', className: 'status-paused' };
    return { text: '대기', className: 'status-waiting' };
  };

  return (
    <div className="dummy-table-container">
      <h3>더미 현황</h3>
      <div className="table-wrapper">
        <table className="dummy-table">
          <thead>
            <tr>
              <th>ID</th>
              <th>상태</th>
              <th>속도(km/h)</th>
              <th>총 거리(km)</th>
              <th>진행률(%)</th>
            </tr>
          </thead>
          <tbody>
            {dummies.length > 0 ? dummies.map((dummy, index) => {
              const status = getStatus(dummy);
              const progress = dummy.totalDistance > 0 ? ((dummy.distanceTraveled / dummy.totalDistance) * 100).toFixed(1) : 0;
              return (
                <tr key={dummy.id}>
                  <td>{`더미 ${index + 1}`}</td>
                  <td className={status.className}>{status.text}</td>
                  <td>{(dummy.speed * 3.6).toFixed(2)}</td>
                  {/* 총 거리를 km 단위로 표시 */}
                  <td>{(dummy.totalDistance / 1000).toFixed(2)}</td>
                  <td>{progress > 100 ? 100 : progress}%</td>
                </tr>
              );
            }) : (
              <tr>
                <td colSpan="5" style={{ textAlign: 'center', padding: '20px' }}>경로를 생성해주세요.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default DummyTable;
