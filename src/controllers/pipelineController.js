const { query } = require('../config/database');

class PipelineController {
    async getPipelines(req, res) {
        try {
            const result = await query(`
                SELECT p.*, 
                       json_agg(
                           json_build_object(
                               'id', s.id,
                               'name', s.name,
                               'position', s.position,
                               'metadata', s.metadata
                           ) ORDER BY s.position
                       ) as stages
                FROM pipelines p
                LEFT JOIN stages s ON p.id = s.pipeline_id
                GROUP BY p.id
                ORDER BY p.created_at
            `);

            res.json(result.rows);
        } catch (error) {
            console.error('Error fetching pipelines:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    }

    async getPipelineWithCustomers(req, res) {
        try {
            const { pipelineId } = req.params;

            const stagesResult = await query(
                `SELECT * FROM stages 
                 WHERE pipeline_id = $1 
                 ORDER BY position`,
                [pipelineId]
            );

            const pipelineData = await Promise.all(
                stagesResult.rows.map(async (stage) => {
                    const customersResult = await query(`
                        SELECT c.*, 
                               cs.expected_deal_size,
                               cs.probability,
                               cs.next_follow_up,
                               json_agg(DISTINCT jsonb_build_object(
                                   'type', ci.type,
                                   'value', ci.value
                               )) FILTER (WHERE ci.id IS NOT NULL) as contact_info
                        FROM customer_stages cs
                        JOIN customers c ON cs.customer_id = c.id
                        LEFT JOIN contact_info ci ON c.id = ci.customer_id
                        WHERE cs.stage_id = $1
                        GROUP BY c.id, cs.expected_deal_size, 
                                 cs.probability, cs.next_follow_up
                        ORDER BY cs.entered_at DESC
                    `, [stage.id]);

                    return {
                        ...stage,
                        customers: customersResult.rows
                    };
                })
            );

            res.json(pipelineData);
        } catch (error) {
            console.error('Error fetching pipeline data:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    }

    async createPipeline(req, res) {
        try {
            const { name, description, stages } = req.body;

            await query('BEGIN');

            const pipelineResult = await query(
                `INSERT INTO pipelines (name, description, created_by) 
                 VALUES ($1, $2, $3) RETURNING *`,
                [name, description, req.user.id]
            );

            const pipeline = pipelineResult.rows[0];

            if (stages && stages.length > 0) {
                for (let i = 0; i < stages.length; i++) {
                    await query(
                        `INSERT INTO stages (pipeline_id, name, position, metadata) 
                         VALUES ($1, $2, $3, $4)`,
                        [pipeline.id, stages[i].name, i, stages[i].metadata || {}]
                    );
                }
            }

            await query('COMMIT');

            res.status(201).json(pipeline);
        } catch (error) {
            await query('ROLLBACK');
            console.error('Error creating pipeline:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    }
}

module.exports = new PipelineController();